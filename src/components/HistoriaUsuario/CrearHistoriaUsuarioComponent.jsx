import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TituloPaginaComponent } from '../Comun/TituloPaginaComponent';
import { PlanAgenteComponent } from '../Comun/PlanAgenteComponent';
import { PasosComponent } from '../Comun/PasosComponent';
import { BotonComponent } from '../Comun/BotonComponent';
import { CampoTextoComponent } from '../Comun/CampoTextoComponent';
import { AreaTextoComponent } from '../Comun/AreaTextoComponent';
import { SelectorComponent } from '../Comun/SelectorComponent';
import { TarjetaComponent } from '../Comun/TarjetaComponent';
import { AlertaComponent } from '../Comun/AlertaComponent';
import { TarjetaAnalisisComponent } from './TarjetaAnalisisComponent';
import { TarjetaPreguntaComponent } from './TarjetaPreguntaComponent';
import { MarkdownAsistenteComponent } from '../AsistenteAnalista/MarkdownAsistenteComponent';
import { useAsistenteAnalista } from '../../hooks/useAsistenteAnalista';
import { borrarBorrador, borradorTieneContenido, guardarBorrador, leerBorrador } from '../../utils/borradorAsistente';
import { addStory, deleteStory, generateStoryId, getStoredStories, getStoryById, guardarHistoria, updateStory } from '../../utils/storage';
import { CamposPlantillaComponent } from './CamposPlantillaComponent';
import { descargarWord } from '../../utils/exportarWord';
import { descargarPdf } from '../../utils/exportarPdf';
import { FIRMANTE_VACIO, TIPOS_SOLICITUD, limpiarLista, normalizarCodigoHu, numeroSugerido } from '../../utils/plantillaHu';
import { criteriosGenericos, criteriosParaEditar, limpiarCriterios, validarCriterios } from '../../utils/criterios';
import { aplicarRevision, etiquetaRevision, numeroRevision } from '../../utils/revisiones';
import { bitacoraConNota } from '../../utils/bitacora';
import { SIN_IDENTIFICAR, leerNombreUsuario } from '../../utils/usuarioActual';
import { OPCION_AREA_SOLICITANTE, OPCION_SISTEMA, armarOpcion } from '../../data/catalogos';
import { EditorCriteriosComponent } from './EditorCriteriosComponent';
import { buildRepositoryPayload, repositorioApi, repositorioErrorMessage } from '../../services/repositorioApi';
import { getWorkflow, resumeWorkflow, retryWorkflow, saveWorkflowDraft, startWorkflow, WorkflowApiError } from '../../services/workflowApi';
import { WorkflowInterruptionForm } from '../Comun/WorkflowInterruptionForm';
import { ImpactoNegocioComponent, WorkflowResultsPanel } from '../Comun/WorkflowResultsPanel';
import '../Comun/workflow-panels.scss';
import {
  MAX_AGENT_MESSAGE_CODEPOINTS,
  buildAnswersMessage,
  buildRequirementMessage,
  codepointLength,
  describeSources,
  latestAssistantResponse,
  latestFailedMessage,
  mapAnalysis,
  mergeQuestions,
  questionsToSend,
  requirementSignature,
} from '../../utils/wizardAgent';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileCode,
  ListFilter,
  HelpCircle,
  Save,
  Clock,
  RotateCcw,
  X,
  FileDown
} from 'lucide-react';

const ROTULO_ESTADO_WORKFLOW = {
  failed: 'detenido por un error',
  running: 'en ejecución',
  completed: 'finalizado',
  cancelled: 'cancelado',
};

// Pasos del asistente. El Asesor Técnico muestra el impacto (paso 4) antes de redactar la historia.
const PASO = Object.freeze({ REQUERIMIENTO: 1, ANALISIS: 2, PREGUNTAS: 3, IMPACTO: 4, HISTORIA: 5, APROBACION: 6 });

const STEPPER_STEPS = [
  { id: PASO.REQUERIMIENTO, label: 'Requerimiento' },
  { id: PASO.ANALISIS, label: 'Análisis del agente' },
  { id: PASO.PREGUNTAS, label: 'Preguntas a Negocio' },
  { id: PASO.IMPACTO, label: 'Impacto en otros módulos' },
  { id: PASO.HISTORIA, label: 'Historia (borrador)' },
  { id: PASO.APROBACION, label: 'Aprobación del PO' }
];

// Paso en el que debe abrirse un flujo según lo que espera (al retomarlo o al recibir su estado).
const pasoDelFlujo = (snapshot) => {
  const kind = snapshot?.interrupt?.kind;
  if (kind === 'business_answers') return PASO.PREGUNTAS;
  if (kind === 'impact_decisions') return PASO.IMPACTO;
  if (snapshot?.results?.story) return PASO.HISTORIA;
  if (snapshot?.results?.technical_assessment) return PASO.IMPACTO;
  return snapshot?.results?.analyst ? PASO.PREGUNTAS : null;
};

// Formulario del paso 1 que se guarda con el flujo para poder retomarlo.
const CAMPO_FORMULARIO = ['requirementName', 'infoType', 'requestType', 'system', 'codigoHu', 'requester', 'description'];

const INFO_TYPE_OPTIONS = [
  { value: 'Minuta', label: 'Minuta de reunión' },
  { value: 'Correo', label: 'Correo' },
  { value: 'Incidente', label: 'Incidente' },
  { value: 'Solicitud de cambio', label: 'Solicitud de cambio (nueva HU)' },
  { value: 'Descripción libre', label: 'Descripción libre' },
  { value: 'Notas de conversación', label: 'Notas de conversación' },
  { value: 'Otro', label: 'Otro formato' }
];

const CrearHistoriaUsuarioContenido = () => {
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const workflowFromChange = ubicacion.state?.workflowSnapshot ?? null;
  // Retomar una HU en proceso: /historias/nueva?flujo=<id>
  const flujoRetomado = new URLSearchParams(ubicacion.search).get('flujo');
  const prefill = ubicacion.state?.prefill;
  const reanalizarId = ubicacion.state?.reanalizarId;
  // Revisión: el cambio de alcance se analiza sobre la misma HU (mismo código), no como una HU nueva.
  const revisionDeId = ubicacion.state?.revisionDeId;
  const [historiaOrigen] = useState(() => (revisionDeId ? getStoryById(revisionDeId) : null));
  // Borrador automático: solo para una historia nueva (no al reanalizar o prellenar).
  const [borrador] = useState(() => (prefill || reanalizarId || workflowFromChange || flujoRetomado ? null : leerBorrador()));
  const [borradorRecuperado, setBorradorRecuperado] = useState(Boolean(borrador));
  const [activeStep, setActiveStep] = useState(workflowFromChange
    ? (workflowFromChange.interrupt?.kind === 'business_answers' ? PASO.ANALISIS : (pasoDelFlujo(workflowFromChange) ?? PASO.HISTORIA))
    : (borrador?.activeStep ?? PASO.REQUERIMIENTO));
  const [retomando, setRetomando] = useState(Boolean(flujoRetomado));
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [formError, setFormError] = useState('');
  const [workflowResponse, setWorkflowResponse] = useState(workflowFromChange);
  const [workflowError, setWorkflowError] = useState('');
  const [workflowErrorStatus, setWorkflowErrorStatus] = useState(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const workflowOperationRef = useRef(false);
  const workflowControllerRef = useRef(null);

  // Agente Analista: la conversación vive mientras dura el wizard.
  const agent = useAsistenteAnalista();
  const afterSuccessStep = useRef(null);
  const [analyzedSignature, setAnalyzedSignature] = useState(borrador?.analyzedSignature ?? null);
  const [sentAnswers, setSentAnswers] = useState(borrador?.sentAnswers ?? {});

  // Step 1: Requerimiento state
  const [requirementName, setRequirementName] = useState(borrador?.requirementName ?? prefill?.name ?? '');
  const [infoType, setInfoType] = useState(borrador?.infoType ?? prefill?.infoType ?? 'Minuta');
  const [description, setDescription] = useState(borrador?.description ?? prefill?.description ?? '');
  const [requestType, setRequestType] = useState(borrador?.requestType ?? prefill?.requestType ?? TIPOS_SOLICITUD[0]);
  const [system, setSystem] = useState(borrador?.system ?? prefill?.system ?? '');
  const [codigoHu, setCodigoHu] = useState(borrador?.codigoHu ?? prefill?.codigoHu ?? '');
  const [requester, setRequester] = useState(borrador?.requester ?? prefill?.requester ?? '');

  // Step 2: análisis del agente
  const [analysis, setAnalysis] = useState(borrador?.analysis ?? {
    knownData: [],
    missingData: [],
    assumptions: [],
    ambiguities: []
  });

  // Step 3: preguntas del agente + respuestas de Negocio
  const [questions, setQuestions] = useState(borrador?.questions ?? prefill?.questions ?? []);

  // Step 4: Generated User Story & Criteria state (borrador simulado)
  const [userStory, setUserStory] = useState(borrador?.userStory ?? {
    asA: '',
    iWant: '',
    soThat: ''
  });
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(borrador?.acceptanceCriteria ?? []);
  const [plantilla, setPlantilla] = useState(borrador?.plantilla ?? {
    number: prefill?.number ?? '',
    benefits: prefill?.benefits?.length ? prefill.benefits : [''],
    signers: { ...FIRMANTE_VACIO, ...(prefill?.signers || {}) },
  });
  const [beneficiosPropuestos, setBeneficiosPropuestos] = useState(false);
  const actualizarPlantilla = (cambio) => setPlantilla((previo) => ({ ...previo, ...cambio }));
  const [descargaError, setDescargaError] = useState('');
  const [pendingQuestions, setPendingQuestions] = useState(borrador?.pendingQuestions ?? []);

  // Step 5: Observations state
  const [observations, setObservations] = useState(borrador?.observations ?? '');
  const [confirmAnonymized, setConfirmAnonymized] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  // Guarda el avance cada vez que cambia algo (solo en historias nuevas).
  useEffect(() => {
    if (prefill || reanalizarId || workflowResponse) return;
    const estado = {
      activeStep, requirementName, infoType, description, requestType, system, codigoHu, requester,
      analyzedSignature, sentAnswers, analysis, questions, userStory, acceptanceCriteria, plantilla,
      pendingQuestions, observations,
    };
    if (borradorTieneContenido(estado)) guardarBorrador(estado);
  }, [activeStep, requirementName, infoType, description, requestType, system, codigoHu, requester,
    analyzedSignature, sentAnswers, analysis, questions, userStory, acceptanceCriteria, plantilla,
    pendingQuestions, observations, prefill, reanalizarId, workflowResponse]);

  const legacyAgentResponse = useMemo(() => latestAssistantResponse(agent.messages), [agent.messages]);
  const agentResponse = workflowResponse?.results?.analyst ?? legacyAgentResponse;
  const failedMessage = useMemo(() => latestFailedMessage(agent.messages), [agent.messages]);
  const isProcessing = agent.isProcessing || isGeneratingStory || workflowBusy;
  const unsentQuestions = questionsToSend(questions, sentAnswers);
  const agentError = failedMessage?.error || agent.error;
  const agentReady = Boolean(agentResponse?.listo_para_redactor) && unsentQuestions.length === 0;
  const esperaRespuesta = workflowResponse?.interrupt?.kind === 'business_answers';
  // Con workflow activo, las preguntas pendientes son las que el backend pide en la interrupción.
  const pendingCount = workflowResponse
    ? (esperaRespuesta ? (workflowResponse.interrupt.payload?.questions ?? []).length : 0)
    : questions.filter((q) => q.status === 'pendiente').length;
  const workflowSinSiguientePaso = Boolean(workflowResponse) && !esperaRespuesta && !agentReady
    && !workflowResponse?.results?.story && !workflowResponse?.results?.technical_assessment;
  const guardado = workflowResponse?.guardado ?? null;
  const sources = describeSources(agentResponse?.fuentes_consultadas);

  const setWorkflowSnapshot = (snapshot) => {
    setWorkflowResponse(snapshot);
    setWorkflowError('');
    setWorkflowErrorStatus(null);
    const analystResult = snapshot?.results?.analyst;
    if (analystResult) {
      setAnalysis(mapAnalysis(analystResult.analisis));
      setQuestions((previous) => mergeQuestions(previous, analystResult.preguntas));
    }
    const activeQuestions = snapshot?.interrupt?.payload?.questions;
    if (Array.isArray(activeQuestions)) {
      setQuestions((previous) => mergeQuestions(previous, activeQuestions));
      setPendingQuestions(activeQuestions.map((question) => question.pregunta));
    } else if (snapshot?.interrupt?.kind !== 'business_answers') {
      setPendingQuestions([]);
    }
    const story = snapshot?.results?.story ?? snapshot?.interrupt?.payload?.story;
    if (story) {
      setUserStory({ asA: story.como, iWant: story.quiero, soThat: story.para });
      setAcceptanceCriteria((story.criterios ?? []).map((criterion) => ({
        given: criterion.dado,
        when: criterion.cuando,
        then: criterion.entonces,
      })));
      setObservations((snapshot?.results?.review_observations ?? story.observations ?? []).join('\n'));
    }
    const paso = pasoDelFlujo(snapshot);
    if (paso) setActiveStep(paso);
  };

  // Al retomar se recupera también el formulario del paso 1 (nombre, sistema, código...).
  const restaurarFormulario = (formulario = {}) => {
    const setter = {
      requirementName: setRequirementName, infoType: setInfoType, requestType: setRequestType, system: setSystem,
      codigoHu: setCodigoHu, requester: setRequester, description: setDescription,
    };
    Object.entries(formulario).forEach(([campo, valor]) => {
      if (setter[campo] && typeof valor === 'string') setter[campo](valor);
    });
  };

  const formularioActual = () => Object.fromEntries(CAMPO_FORMULARIO.map((campo) => [campo, String({
    requirementName, infoType, requestType, system, codigoHu: normalizarCodigoHu(codigoHu), requester, description,
  }[campo] ?? '')]));

  const datosParaRetomar = () => ({
    titulo: requirementName.trim().slice(0, 200) || undefined,
    creado_por: (leerNombreUsuario() || '').slice(0, 120) || undefined,
    formulario: formularioActual(),
  });

  const runWorkflowRequest = async (operation) => {
    if (workflowOperationRef.current) return null;
    workflowOperationRef.current = true;
    workflowControllerRef.current?.abort();
    const controller = new AbortController();
    workflowControllerRef.current = controller;
    setWorkflowBusy(true);
    setWorkflowError('');
    setWorkflowErrorStatus(null);
    try {
      return await operation(controller.signal);
    } catch (cause) {
      if (cause?.name === 'AbortError') return null;
      setWorkflowError(cause instanceof WorkflowApiError ? cause.message : 'No se pudo comunicar con el servicio del workflow.');
      setWorkflowErrorStatus(cause?.status || null);
      return null;
    } finally {
      workflowOperationRef.current = false;
      workflowControllerRef.current = null;
      setWorkflowBusy(false);
    }
  };

  const refreshWorkflow = async () => {
    if (!workflowResponse?.workflow_id) return;
    const snapshot = await runWorkflowRequest((signal) => getWorkflow(workflowResponse.workflow_id, { signal }));
    if (snapshot) setWorkflowSnapshot(snapshot);
  };

  const startFreshWorkflow = async () => {
    if (!requirementName.trim() || !description.trim()) {
      setWorkflowError('Complete el nombre y la descripción del requerimiento antes de iniciar otro flujo.');
      return;
    }
    const requirement = buildRequirementMessage(
      { name: requirementName, infoType, description, system, codigoHu: normalizarCodigoHu(codigoHu), requestType },
    );
    const snapshot = await runWorkflowRequest((signal) => startWorkflow({ mode: 'pre_grooming', requirement, ...datosParaRetomar() }, { signal }));
    if (snapshot) setWorkflowSnapshot(snapshot);
  };

  // Guarda respuestas escritas y no enviadas, para terminarlas otro día.
  const guardarRespuestasSinEnviar = async (respuestas) => {
    if (!workflowResponse?.workflow_id) return false;
    const limpias = Object.fromEntries(Object.entries(respuestas).filter(([, valor]) => String(valor).trim()));
    // Es rápido y no ejecuta agentes: no se muestra la pantalla de espera, para no perder lo que está escrito.
    try {
      await saveWorkflowDraft(workflowResponse.workflow_id, limpias);
    } catch (cause) {
      setWorkflowError(cause instanceof WorkflowApiError ? cause.message : 'No se pudieron guardar las respuestas.');
      setWorkflowErrorStatus(cause?.status || null);
      return false;
    }
    setWorkflowResponse((actual) => (actual ? { ...actual, guardado: { ...(actual.guardado ?? {}), borrador_respuestas: limpias } } : actual));
    return true;
  };

  // Vuelve a ejecutar el paso que falló, desde el último punto guardado.
  const reintentarFlujo = async () => {
    if (!workflowResponse?.workflow_id) return;
    const snapshot = await runWorkflowRequest((signal) => retryWorkflow(workflowResponse.workflow_id, { signal }));
    if (snapshot) setWorkflowSnapshot(snapshot);
  };

  // Tras un error, el estado guardado dice si se puede reintentar; se consulta sin ocultar el error.
  const actualizarTrasError = async (workflowId) => {
    try {
      const snapshot = await getWorkflow(workflowId);
      setWorkflowResponse(snapshot);
    } catch (cause) {
      console.warn('No se pudo consultar el estado del flujo después del error:', cause?.message ?? cause);
    }
  };

  const resumeWorkflowInterrupt = async (body) => {
    if (!workflowResponse?.workflow_id || !body?.interrupt_id) return;
    const workflowId = workflowResponse.workflow_id;
    const snapshot = await runWorkflowRequest((signal) => resumeWorkflow(workflowId, body, { signal }));
    if (!snapshot) {
      await actualizarTrasError(workflowId);
      return;
    }
    setWorkflowSnapshot(snapshot);
    const persistence = snapshot.results?.persistence_result;
    if (body.kind === 'po_approval' && body.response?.decision === 'aprobar' && persistence?.status === 'saved') {
      const id = persistence.story_id;
      const previa = getStoryById(id);
      const hoy = new Date().toISOString().slice(0, 10);
      const approved = {
        ...baseStoryData(),
        id,
        status: 'aprobada',
        approvedAt: persistence.approved_at ?? new Date().toISOString(),
        repositorySynced: true,
        analisisDesactualizado: false,
        respuestasNuevas: false,
        criteriosModificados: false,
      };
      // El Repositorio de HU ya lo escribió el backend; aquí se guarda la copia de trabajo que muestran
      // el listado y el detalle, también en la base para que la sincronización no la borre.
      guardarHistoria({
        ...(previa ?? { createdAt: hoy, createdBy: leerNombreUsuario() }),
        ...approved,
        updatedAt: hoy,
        updatedBy: leerNombreUsuario(),
      });
      borrarBorrador();
      navigate(`/historias/${id}`);
    } else if (body.kind === 'po_approval' && body.response?.decision === 'aprobar'
      && persistence?.status === 'failed') {
      setWorkflowError(snapshot.results?.completion_reason || 'El backend no pudo persistir la HU aprobada.');
    }
  };

  useEffect(() => () => workflowControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!workflowFromChange) return;
    setWorkflowSnapshot(workflowFromChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowFromChange?.workflow_id]);

  // Retomar una HU en proceso: se carga el flujo guardado y se abre en el paso donde quedó.
  useEffect(() => {
    if (!flujoRetomado) return;
    (async () => {
      const snapshot = await runWorkflowRequest((signal) => getWorkflow(flujoRetomado, { signal }));
      if (snapshot) {
        restaurarFormulario(snapshot.guardado?.formulario);
        setAnalyzedSignature('retomado');
        setWorkflowSnapshot(snapshot);
        if (!pasoDelFlujo(snapshot)) setActiveStep(PASO.PREGUNTAS);
      }
      setRetomando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flujoRetomado]);

  // Cada respuesta nueva del agente actualiza el análisis y las preguntas.
  const turnId = agentResponse?.turn_id;
  useEffect(() => {
    if (!agentResponse) return;
    setAnalysis(mapAnalysis(agentResponse.analisis));
    setQuestions((previous) => mergeQuestions(previous, agentResponse.preguntas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  const runAgentTurn = async (message, targetStep) => {
    afterSuccessStep.current = targetStep;
    const ok = await agent.sendMessage(message);
    if (ok) setActiveStep(targetStep);
    return ok;
  };

  // Step 1 handler -> el Agente Analista analiza el requerimiento
  const handleAnalyzeRequirement = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!requirementName.trim() || !description.trim()) {
      setFormError('Complete el nombre y la descripción del requerimiento.');
      return;
    }
    if (!system.trim() || !normalizarCodigoHu(codigoHu)) {
      setFormError('Indique el sistema y el código de HU: se usan para numerar la historia y para el documento Word.');
      return;
    }
    const signature = requirementSignature({ name: requirementName, infoType, description });
    if (agentResponse && signature === analyzedSignature) {
      setActiveStep(2);
      return;
    }
    const message = buildRequirementMessage(
      { name: requirementName, infoType, description, system, codigoHu: normalizarCodigoHu(codigoHu), requestType },
      { isUpdate: Boolean(agentResponse) },
    );
    if (codepointLength(message) > MAX_AGENT_MESSAGE_CODEPOINTS) {
      setFormError(`El requerimiento supera el máximo de ${MAX_AGENT_MESSAGE_CODEPOINTS} caracteres. Resuma o divida la información.`);
      return;
    }

    const snapshot = await runWorkflowRequest((signal) => startWorkflow({
      mode: 'pre_grooming',
      requirement: message,
      ...datosParaRetomar(),
    }, { signal }));
    if (snapshot) {
      setWorkflowSnapshot(snapshot);
      setAnalyzedSignature(signature);
      if (snapshot.status === 'failed') {
        setWorkflowError(snapshot.results?.completion_reason || 'El workflow no pudo completar el análisis. Puede continuar con el modo manual.');
      }
      return;
    }

    setWorkflowResponse(null);
    setWorkflowError((current) => current || 'El servicio de workflow no respondió. Se continuará con el Analista existente en modo manual.');
    // Al reanalizar una historia guardada, las respuestas de Negocio ya registradas viajan con el requerimiento.
    const respuestas = agentResponse ? '' : buildAnswersMessage(questions, sentAnswers);
    const mensajeCompleto = respuestas ? `${message}\n\n${respuestas}` : message;
    if (codepointLength(mensajeCompleto) > MAX_AGENT_MESSAGE_CODEPOINTS) {
      setFormError(`El requerimiento con sus respuestas supera el máximo de ${MAX_AGENT_MESSAGE_CODEPOINTS} caracteres. Resuma la información.`);
      return;
    }
    const enviadas = Object.fromEntries(questionsToSend(questions, sentAnswers).map((q) => [q.id, q.answer.trim()]));
    const ok = await runAgentTurn(mensajeCompleto, 2);
    if (ok) {
      setAnalyzedSignature(signature);
      if (respuestas) setSentAnswers((previous) => ({ ...previous, ...enviadas }));
    }
  };

  // Step 3 handler -> las respuestas de Negocio vuelven al agente
  const handleSendAnswers = async () => {
    if (workflowResponse?.interrupt?.kind === 'business_answers') {
      const pending = workflowResponse.interrupt.payload?.questions ?? [];
      const unanswered = pending.filter((question) => {
        const local = questions.find((item) => item.id === question.question_id);
        return !String(local?.answer ?? '').trim();
      });
      if (unanswered.length) {
        setFormError('Responda todas las preguntas pendientes de Negocio antes de continuar.');
        return;
      }
      const resumeBody = {
        kind: 'business_answers',
        interrupt_id: workflowResponse.interrupt.interrupt_id,
        response: {
          answers: pending.map((question) => ({
            question_id: question.question_id,
            answer: questions.find((item) => item.id === question.question_id).answer.trim(),
          })),
        },
      };
      setFormError('');
      const workflowId = workflowResponse.workflow_id;
      const snapshot = await runWorkflowRequest((signal) => resumeWorkflow(workflowId, resumeBody, { signal }));
      if (snapshot) setWorkflowSnapshot(snapshot);
      else await actualizarTrasError(workflowId);
      return;
    }
    const respuestas = buildAnswersMessage(questions, sentAnswers);
    if (!respuestas) return;
    // Si se recuperó un borrador, el agente ya no tiene la conversación: se le reenvía el requerimiento.
    const message = agentResponse
      ? respuestas
      : `${buildRequirementMessage(
        { name: requirementName, infoType, description, system, codigoHu: normalizarCodigoHu(codigoHu), requestType },
        { isUpdate: false },
      )}\n\n${respuestas}`;
    if (codepointLength(message) > MAX_AGENT_MESSAGE_CODEPOINTS) {
      setFormError('Las respuestas superan el máximo permitido por envío. Envíe primero algunas y luego el resto.');
      return;
    }
    setFormError('');
    const snapshot = Object.fromEntries(questionsToSend(questions, sentAnswers).map((q) => [q.id, q.answer.trim()]));
    const ok = await runAgentTurn(message, 3);
    if (ok) setSentAnswers((previous) => ({ ...previous, ...snapshot }));
  };

  const handleRetryAgent = async () => {
    if (!failedMessage) return;
    const ok = await agent.retryMessage(failedMessage.id);
    if (!ok) return;
    if (afterSuccessStep.current) setActiveStep(afterSuccessStep.current);
    if (afterSuccessStep.current === 2) {
      setAnalyzedSignature(requirementSignature({ name: requirementName, infoType, description }));
    }
  };

  const handleRestartAnalysis = async () => {
    await agent.resetConversation();
    setAnalysis({ knownData: [], missingData: [], assumptions: [], ambiguities: [] });
    setQuestions([]);
    setSentAnswers({});
    setAnalyzedSignature(null);
    setUserStory({ asA: '', iWant: '', soThat: '' });
    setAcceptanceCriteria([]);
    setPendingQuestions([]);
    setWorkflowResponse(null);
    setWorkflowError('');
    setFormError('');
    setActiveStep(1);
  };

  // Step 3 -> Step 4: borrador simulado (el Agente Redactor-Revisor aún no existe)
  const handleGenerateStory = () => {
    if (workflowResponse) {
      if (workflowResponse.interrupt?.kind === 'business_answers' || !workflowResponse.results?.story) {
        setFormError('El Analista tiene preguntas de Negocio pendientes; deben responderse y enviarse al workflow primero.');
        return;
      }
      setActiveStep(PASO.HISTORIA);
      return;
    }
    if (pendingCount > 0 || unsentQuestions.length > 0) {
      setFormError('No avance a la HU mientras queden preguntas de Negocio sin respuesta y enviadas al Analista.');
      return;
    }
    setIsGeneratingStory(true);

    setTimeout(() => {
      // Los beneficios los propone el agente; solo se cargan si la persona aún no escribió los suyos.
      const beneficioAgente = limpiarLista(agentResponse?.beneficios || []);
      const sinBeneficioEscrito = !plantilla.benefits.some((beneficio) => beneficio.trim());
      if (beneficioAgente.length > 0 && sinBeneficioEscrito) {
        setPlantilla((previo) => ({ ...previo, benefits: beneficioAgente }));
        setBeneficiosPropuestos(true);
      }

      if (historiaOrigen) {
        // Revisión: se parte de la HU vigente para que la persona ajuste solo lo que cambia.
        setUserStory({ asA: '', iWant: '', soThat: '', ...(historiaOrigen.userStory ?? {}) });
        setAcceptanceCriteria(criteriosParaEditar(historiaOrigen.acceptanceCriteria));
      } else {
        // Build generated user story
        setUserStory({
          asA: 'Usuario / Ejecutivo del Sistema',
          iWant: `Gestionar ${requirementName.toLowerCase()} de forma automatizada`,
          soThat: beneficioAgente[0] || 'pueda mantener actualizados los registros de negocio y garantizar la consistencia operativa.'
        });

        // Criterios genéricos de partida (sin datos del requerimiento) hasta que exista el Agente Redactor-Revisor.
        setAcceptanceCriteria(criteriosGenericos());
      }

      // Preguntas que siguen sin respuesta
      setPendingQuestions(
        questions
          .filter((q) => q.status === 'pendiente' || !q.answer.trim())
          .map((q) => q.question)
      );

      setIsGeneratingStory(false);
      setActiveStep(PASO.HISTORIA);
    }, 800);
  };

  // Question answer handler
  const handleQuestionAnswerChange = (qId, newAnswer) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id === qId) {
          return {
            ...q,
            answer: newAnswer,
            status: newAnswer.trim() ? 'respondida' : 'pendiente'
          };
        }
        return q;
      })
    );
  };

  // Step 4: la persona edita el borrador (el Agente Redactor-Revisor aún no existe)
  const handleUserStoryChange = (field, value) => setUserStory((prev) => ({ ...prev, [field]: value }));

  // Al llegar a la historia se propone el número según el código de HU y las historias ya guardadas.
  useEffect(() => {
    if (activeStep !== PASO.HISTORIA) return;
    setPlantilla((previo) => (previo.number.trim()
      ? previo
      : { ...previo, number: numeroSugerido(codigoHu, getStoredStories()) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  const handleDownloadWord = async () => {
    setDescargaError('');
    try {
      await descargarWord({ id: '', ...baseStoryData() });
    } catch (error) {
      console.error('No se pudo generar el documento Word:', error);
      setDescargaError('No se pudo generar el documento Word. Intente de nuevo.');
    }
  };

  const handleDownloadPdf = async () => {
    setDescargaError('');
    try {
      await descargarPdf({ id: '', ...baseStoryData() });
    } catch (error) {
      console.error('No se pudo generar el documento PDF:', error);
      setDescargaError('No se pudo generar el documento PDF. Intente de nuevo.');
    }
  };

  const criteriosValidacion = validarCriterios(acceptanceCriteria);
  const storyIsComplete = Boolean(userStory.asA.trim() && userStory.iWant.trim() && userStory.soThat.trim())
    && criteriosValidacion.ok;
  const workflowStory = workflowResponse?.results?.story;
  const workflowStoryEdited = Boolean(workflowStory && (
    userStory.asA !== workflowStory.como
    || userStory.iWant !== workflowStory.quiero
    || userStory.soThat !== workflowStory.para
    || JSON.stringify(acceptanceCriteria.map(({ given, when, then }) => ({ dado: given, cuando: when, entonces: then })))
      !== JSON.stringify(workflowStory.criterios)
    || observations !== (workflowResponse.results?.review_observations ?? workflowStory.observations ?? []).join('\n')
  ));

  const baseStoryData = () => ({
    title: requirementName,
    type: 'Nueva Funcionalidad',
    requirementName,
    infoType,
    requestType,
    system: system.trim(),
    codigoHu: normalizarCodigoHu(codigoHu),
    requester: requester.trim(),
    number: plantilla.number.trim(),
    benefits: limpiarLista(plantilla.benefits),
    signers: plantilla.signers,
    description,
    analysis,
    questions,
    userStory,
    acceptanceCriteria: limpiarCriterios(acceptanceCriteria),
    pendingQuestions,
    // La nota del paso 5 se suma a la bitácora que ya tenga la HU (la que se revisa o se vuelve a analizar).
    bitacora: bitacoraConNota(historiaOrigen ?? (reanalizarId ? getStoryById(reanalizarId) : null), observations, { autor: leerNombreUsuario() || SIN_IDENTIFICAR }),
  });

  // Guardar sin aprobar: queda como borrador del analista
  const handleSaveDraft = () => {
    const unanswered = questions
      .filter((question) => question.status === 'pendiente' || !String(question.answer ?? '').trim())
      .map((question) => question.question);
    const sinAnalizar = activeStep === PASO.REQUERIMIENTO && !agentResponse;
    const datos = {
      ...baseStoryData(),
      pendingQuestions: unanswered,
      status: sinAnalizar ? 'borrador' : (unanswered.length > 0 ? 'pendiente_de_informacion' : 'revisada'),
    };
    // Re-análisis de un borrador existente: se actualiza la misma HU en lugar de crear otra.
    const saved = (reanalizarId && updateStory(reanalizarId, { ...datos, analisisDesactualizado: false, respuestasNuevas: false, criteriosModificados: false })) || addStory(datos);
    borrarBorrador();
    navigate(`/historias/${saved.id}`);
  };

  // El Product Owner aprueba: la HU pasa al Repositorio de HU (memoria de largo plazo)
  const handleApproveStory = async () => {
    setApprovalError('');
    if (!confirmAnonymized) {
      setApprovalError('Confirme que la historia no contiene datos personales reales.');
      return;
    }
    setIsApproving(true);
    const id = historiaOrigen ? historiaOrigen.id : generateStoryId();
    try {
      await repositorioApi.saveStory(buildRepositoryPayload({
        id, code: plantilla.number, title: requirementName, infoType, description, userStory, acceptanceCriteria, questions,
      }));
    } catch (cause) {
      setApprovalError(repositorioErrorMessage(cause));
      setIsApproving(false);
      return;
    }
    const datosAprobados = {
      ...baseStoryData(),
      status: 'aprobada',
      approvedAt: new Date().toISOString(),
      repositorySynced: true,
      analisisDesactualizado: false,
      respuestasNuevas: false,
      criteriosModificados: false,
    };
    // Revisión: la misma HU pasa a la revisión siguiente y la anterior queda en su historial.
    const saved = historiaOrigen
      ? updateStory(historiaOrigen.id, aplicarRevision(historiaOrigen, datosAprobados, prefill?.motivoRevision)) ?? historiaOrigen
      : addStory({ ...datosAprobados, id });
    if (reanalizarId) deleteStory(reanalizarId);
    borrarBorrador();
    navigate(`/historias/${saved.id}`);
  };

  return (
    <div>
      <TituloPaginaComponent
        title="Creación de Historia de Usuario"
        description="Flujo asistido por IA para el análisis y estructuración de historias de usuario."
      />

      {historiaOrigen && (
        <AlertaComponent type="info" title={`Revisión de ${historiaOrigen.number || 'la HU'}: pasará de ${etiquetaRevision(historiaOrigen)} a Rev. ${numeroRevision(historiaOrigen) + 1}`}>
          Es la misma historia, con el mismo código. Al aprobarla reemplaza a la versión vigente y la anterior queda en el historial de revisiones. Si sale sin aprobar, la versión vigente no cambia.
        </AlertaComponent>
      )}

      <PasosComponent
        steps={STEPPER_STEPS}
        activeStep={activeStep}
        onStepClick={(step) => {
          if ((workflowResponse?.interrupt?.kind === 'business_answers' || (!workflowResponse && pendingCount > 0)) && step > PASO.PREGUNTAS) {
            setFormError('No avance con preguntas de Negocio pendientes; respóndalas y reanude el flujo.');
            return;
          }
          if (workflowResponse?.interrupt?.kind === 'impact_decisions' && step > PASO.IMPACTO) {
            setFormError('Revise el impacto en otros módulos y confirme para que se redacte la historia.');
            return;
          }
          if (workflowResponse && step >= PASO.HISTORIA && !workflowResponse.results?.story) {
            setFormError('El flujo todavía no ha generado la historia.');
            return;
          }
          setFormError('');
          setActiveStep(step);
        }}
      />

      {workflowResponse && (
        <AlertaComponent type="info" title={guardado?.persistente ? 'El avance se guarda automáticamente' : 'Flujo activo'}>
          {guardado?.persistente
            ? 'Cada vez que el flujo espera una respuesta queda guardado. Puede salir y retomarlo otro día desde Historias de Usuario → En proceso.'
            : 'Este flujo vive mientras el servicio esté activo; si se reinicia, hay que iniciar uno nuevo.'}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <BotonComponent variant="secondary" onClick={refreshWorkflow} disabled={workflowBusy}>Consultar estado</BotonComponent>
            {guardado?.reintentable && (
              <BotonComponent variant="primary" icon={RotateCcw} onClick={reintentarFlujo} disabled={workflowBusy}>Reintentar el paso que falló</BotonComponent>
            )}
            <BotonComponent variant="secondary" onClick={startFreshWorkflow} disabled={workflowBusy}>Iniciar un flujo nuevo</BotonComponent>
          </div>
        </AlertaComponent>
      )}
      {workflowError && (
        <AlertaComponent type={workflowErrorStatus === 404 ? 'warning' : 'danger'} title={workflowErrorStatus ? `Workflow: HTTP ${workflowErrorStatus}` : 'Workflow no disponible'}>
          {workflowError}
          {!workflowResponse && <p>Puede seguir con el flujo manual del Analista existente. Una HU manual no se combinará con una aprobación del workflow.</p>}
          {workflowResponse && workflowErrorStatus === 404 && <p>El flujo no se encontró. Inicie uno nuevo para continuar.</p>}
          {workflowResponse && guardado?.reintentable && <p>El avance anterior quedó guardado. Use «Reintentar el paso que falló».</p>}
          {!workflowResponse && (
            <div style={{ marginTop: '0.6rem' }}>
              <BotonComponent variant="secondary" onClick={startFreshWorkflow} disabled={workflowBusy}>Reintentar con un workflow nuevo</BotonComponent>
            </div>
          )}
        </AlertaComponent>
      )}
      {retomando && (
        <AlertaComponent type="info" title="Retomando la HU en proceso">Cargando el avance guardado…</AlertaComponent>
      )}

      {borradorRecuperado && (
        <AlertaComponent type="info" title="Se recuperó su borrador">
          Continúa donde se quedó. Su avance se guarda solo en este navegador mientras escribe.
          <div style={{ marginTop: '0.5rem' }}>
            <BotonComponent
              variant="secondary"
              onClick={() => {
                borrarBorrador();
                setBorradorRecuperado(false);
                navigate('/historias/nueva', { replace: true, state: { reiniciar: Date.now() } });
              }}
            >
              Descartar borrador y empezar de nuevo
            </BotonComponent>
          </div>
        </AlertaComponent>
      )}

      {/* Carga: el Agente Analista (pasos 1-3) o el borrador simulado (paso 4) */}
      {isProcessing && (
        <div className="ai-loader" role="status" aria-live="polite">
          <div className="ai-loader__spinner"></div>
          <p className="ai-loader__text">
            {isGeneratingStory
              ? 'Generando el borrador de la Historia de Usuario...'
              : activeStep === PASO.PREGUNTAS
                ? 'El Analista revisa las respuestas; si ya no quedan vacíos, el Asesor Técnico busca qué otras funciones afecta el cambio...'
                : activeStep === PASO.IMPACTO
                  ? 'El Redactor-Revisor escribe y revisa la historia de usuario...'
                  : activeStep >= PASO.HISTORIA
                    ? 'El flujo continúa con la decisión indicada...'
                    : 'El Agente Analista está analizando el requerimiento...'}
          </p>
          <p className="ai-loader__subtext">
            {isGeneratingStory
              ? 'Borrador del modo manual (sin el flujo de agentes).'
              : workflowResponse
                ? 'Puede tardar varios minutos. Si sale de la página, el avance anterior queda guardado.'
                : 'Consulta glosario, HU similares, estándares y checklist. Puede tardar unos minutos.'}
          </p>
          {agent.isProcessing && (
            <BotonComponent variant="secondary" icon={X} onClick={agent.cancelTurn}>
              Cancelar
            </BotonComponent>
          )}
        </div>
      )}

      {!isProcessing && activeStep <= 3 && agent.backendConnection === 'disconnected' && (
        <AlertaComponent type="danger" title="El agente no responde">
          No se pudo conectar con el backend del Agente Analista. Verifique que FastAPI y OpenCode estén iniciados.
          <div style={{ marginTop: '0.75rem' }}>
            <BotonComponent variant="secondary" icon={RotateCcw} onClick={() => agent.refreshHealth()}>
              Reintentar conexión
            </BotonComponent>
          </div>
        </AlertaComponent>
      )}

      {!isProcessing && activeStep <= 3 && agent.backendConnection !== 'disconnected' && agentError && (
        <AlertaComponent type="danger" title="No se pudo completar el análisis">
          {agentError}
          {failedMessage?.retryAt && (
            <p style={{ marginTop: '0.4rem' }}>Podrá reintentar a partir de {new Date(failedMessage.retryAt).toLocaleString('es-CR')}.</p>
          )}
          {failedMessage && (
            <div style={{ marginTop: '0.75rem' }}>
              <BotonComponent variant="secondary" icon={RotateCcw} onClick={handleRetryAgent}>
                Reintentar
              </BotonComponent>
            </div>
          )}
        </AlertaComponent>
      )}

      {!isProcessing && (
        <>
          {/* STEP 1: Requerimiento */}
          {activeStep === 1 && (
            <TarjetaComponent title="Paso 1 — Definición del Requerimiento" subtitle="Ingrese la minuta, el correo o el incidente recibido de Negocio. El Agente Analista lo clasificará y generará preguntas.">
              <AlertaComponent type="info" title="Antes del grooming">
                Esta etapa corresponde al Agente Analista. No ingrese datos personales reales (nombres de clientes, identificaciones, números de póliza): anonimícelos antes de pegar la información.
              </AlertaComponent>
              <form onSubmit={handleAnalyzeRequirement}>
                <CampoTextoComponent
                  label="Nombre del requerimiento"
                  id="req-name"
                  required
                  placeholder="Ej. Modificación de coberturas en pólizas vigentes"
                  value={requirementName}
                  onChange={(e) => setRequirementName(e.target.value)}
                />

                <SelectorComponent
                  label="Tipo de información"
                  id="info-type"
                  required
                  options={INFO_TYPE_OPTIONS}
                  value={infoType}
                  onChange={(e) => setInfoType(e.target.value)}
                />

                <div className="grid-2">
                  <SelectorComponent
                    label="Tipo de solicitud"
                    id="request-type"
                    required
                    options={TIPOS_SOLICITUD.map((tipo) => ({ value: tipo, label: tipo }))}
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                  />
                  <SelectorComponent
                    label="Sistema"
                    id="req-system"
                    required
                    options={armarOpcion(OPCION_SISTEMA, system, 'Seleccione un sistema')}
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                  />
                </div>
                <div className="grid-2">
                  <CampoTextoComponent
                    label="Código de HU"
                    id="req-codigo-hu"
                    required
                    placeholder="Ej. POL-OF"
                    value={codigoHu}
                    onChange={(e) => setCodigoHu(e.target.value)}
                    hint="Prefijo del número de la HU; por ejemplo POL-OF genera HU-POL-OF-001."
                  />
                  <SelectorComponent
                    label="Área solicitante"
                    id="req-requester"
                    options={armarOpcion(OPCION_AREA_SOLICITANTE, requester, 'Seleccione un área')}
                    value={requester}
                    onChange={(e) => setRequester(e.target.value)}
                  />
                </div>

                <AreaTextoComponent
                  label="Descripción o información de negocio"
                  id="req-desc"
                  required
                  rows={6}
                  placeholder="Describa el requerimiento tal como lo expresó el cliente o equipo de negocio..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  hint={`Puede copiar y pegar notas desestructuradas, correos o minutas (máximo ${MAX_AGENT_MESSAGE_CODEPOINTS} caracteres en total).`}
                />

                {formError && <AlertaComponent type="danger" title="Revise el formulario">{formError}</AlertaComponent>}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                  {agentResponse ? (
                    <BotonComponent type="button" variant="secondary" icon={RotateCcw} onClick={handleRestartAnalysis}>
                      Empezar de nuevo
                    </BotonComponent>
                  ) : (
                    <BotonComponent
                      type="button"
                      variant="secondary"
                      icon={Save}
                      onClick={() => {
                        if (!requirementName.trim()) {
                          setFormError('Escriba al menos el nombre del requerimiento para guardarlo.');
                          return;
                        }
                        handleSaveDraft();
                      }}
                    >
                      Guardar y continuar después
                    </BotonComponent>
                  )}
                  <BotonComponent type="submit" variant="primary" icon={Sparkles} size="lg">
                    {agentResponse ? 'Volver a analizar' : 'Analizar Requerimiento'}
                  </BotonComponent>
                </div>
              </form>
            </TarjetaComponent>
          )}

          {/* STEP 2: Análisis */}
          {activeStep === 2 && (
            <div>
              <TarjetaComponent
                title="Paso 2 — Análisis del Agente Analista"
                subtitle="Clasificación de la información en conocida, faltante, supuesta y ambigua."
              >
                <AlertaComponent type="info" title="Análisis completado">
                  El agente analizó <strong>"{requirementName}"</strong>. Es una propuesta: usted decide qué llevar a Negocio.
                </AlertaComponent>

                <TarjetaAnalisisComponent analysis={analysis} />

                {agentResponse?.respuesta_markdown && (
                  <details style={{ marginTop: '1.25rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      Ver el resumen completo del agente
                    </summary>
                    <div style={{ marginTop: '0.75rem' }}>
                      <MarkdownAsistenteComponent content={agentResponse.respuesta_markdown} />
                    </div>
                  </details>
                )}

                {sources.length > 0 && (
                  <p style={{ marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    <strong>Fuentes consultadas:</strong>{' '}
                    {sources.map((source) => `${source.label} (${source.count})`).join(' · ')}.
                    {' '}Las fuentes son simuladas o anonimizadas y deben confirmarse con Negocio.
                  </p>
                )}
                <PlanAgenteComponent plan={agentResponse?.plan_agente} style={{ marginTop: '1rem' }} />
                {agentResponse?.limitaciones?.length > 0 && (
                  <ul style={{ paddingLeft: '1.2rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    {agentResponse.limitaciones.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <BotonComponent variant="secondary" icon={ArrowLeft} onClick={() => setActiveStep(1)}>
                    Atrás
                  </BotonComponent>
                  <BotonComponent variant="primary" icon={ArrowRight} onClick={() => setActiveStep(3)}>
                    Preguntas a Negocio ({pendingCount})
                  </BotonComponent>
                </div>
              </TarjetaComponent>
            </div>
          )}

          {/* STEP 3: Preguntas a Negocio */}
          {activeStep === 3 && (
            <div>
              <TarjetaComponent
                title="Paso 3 — Preguntas de Aclaración para Negocio"
                subtitle="Lleve estas preguntas a Negocio, registre sus respuestas y envíelas al agente. Se repite hasta que no queden vacíos."
              >
                {workflowSinSiguientePaso ? (
                  <AlertaComponent type={workflowResponse.status === 'failed' ? 'danger' : 'info'} title={`Flujo ${ROTULO_ESTADO_WORKFLOW[workflowResponse.status] ?? workflowResponse.status}`}>
                    {workflowResponse.results?.completion_reason || workflowError || 'El flujo no espera respuestas de Negocio ni tiene un borrador. Puede consultar el estado o iniciar de nuevo desde el paso 1.'}
                  </AlertaComponent>
                ) : agentReady ? (
                  <AlertaComponent type="success" title="No quedan vacíos relevantes">
                    {workflowResponse
                      ? 'El agente considera aclarado el requerimiento. Siga al paso 4 para revisar qué otras funciones afecta el cambio.'
                      : 'El agente considera aclarado el requerimiento. Puede generar el borrador de la Historia de Usuario.'}
                    {(agentResponse?.supuesto_validar_po?.length ?? 0) > 0 && (
                      <> Quedan {agentResponse.supuesto_validar_po.length} supuestos que validará el Product Owner al aprobar.</>
                    )}
                  </AlertaComponent>
                ) : (
                  <AlertaComponent type="warning" title={pendingCount === 1 ? 'Queda 1 pregunta pendiente' : `Quedan ${pendingCount} preguntas pendientes`}>
                    Registre las respuestas y envíelas al Analista. La HU no estará disponible para aprobación mientras quede alguna pregunta pendiente.
                  </AlertaComponent>
                )}

                {!workflowResponse && questions.length === 0 && (
                  <p style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>El agente no generó preguntas para este requerimiento.</p>
                )}

                {workflowResponse?.interrupt?.kind === 'business_answers' ? (
                  <WorkflowInterruptionForm
                    key={workflowResponse.interrupt.interrupt_id}
                    interrupt={workflowResponse.interrupt}
                    onResume={resumeWorkflowInterrupt}
                    busy={workflowBusy}
                    error={workflowError}
                    borrador={guardado?.borrador_respuestas}
                    onSaveDraft={guardado?.persistente ? guardarRespuestasSinEnviar : undefined}
                  />
                ) : !workflowResponse && questions.map((q, idx) => (
                  <TarjetaPreguntaComponent key={q.id} question={q} index={idx} onAnswerChange={handleQuestionAnswerChange} />
                ))}

                {formError && <AlertaComponent type="danger" title="No se pudo enviar">{formError}</AlertaComponent>}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <BotonComponent variant="secondary" icon={ArrowLeft} onClick={() => setActiveStep(PASO.ANALISIS)}>
                    Atrás
                  </BotonComponent>
                  {workflowResponse && workflowResponse.results?.technical_assessment && (
                    <BotonComponent variant="primary" icon={ArrowRight} onClick={() => setActiveStep(PASO.IMPACTO)}>
                      Impacto en otros módulos
                    </BotonComponent>
                  )}
                  {!workflowResponse && (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <BotonComponent variant={unsentQuestions.length > 0 ? 'primary' : 'secondary'} icon={Sparkles} onClick={handleSendAnswers} disabled={unsentQuestions.length === 0}>
                        Enviar respuestas al agente{unsentQuestions.length > 0 ? ` (${unsentQuestions.length})` : ''}
                      </BotonComponent>
                      <BotonComponent variant={agentReady ? 'primary' : 'secondary'} icon={ArrowRight} onClick={handleGenerateStory} disabled={unsentQuestions.length > 0 || pendingCount > 0} title={pendingCount > 0 ? 'Responda y envíe todas las preguntas pendientes' : undefined}>
                        Generar Historia de Usuario
                      </BotonComponent>
                      {pendingCount > 0 && <BotonComponent variant="secondary" onClick={handleSaveDraft}>Guardar borrador pendiente</BotonComponent>}
                    </div>
                  )}
                </div>
              </TarjetaComponent>
            </div>
          )}

          {/* STEP 4: Impacto en otros módulos (Asesor Técnico) */}
          {activeStep === PASO.IMPACTO && (
            <div>
              <TarjetaComponent
                title="Paso 4 — Impacto en otros módulos"
                subtitle="El Asesor Técnico revisó qué otras funciones del sistema afecta el cambio. Revise y tome las decisiones pendientes antes de redactar la historia."
              >
                {!workflowResponse ? (
                  <AlertaComponent type="info" title="Disponible con el flujo de agentes">
                    En el modo manual no se revisa el impacto en otros módulos. Continúe con la historia.
                  </AlertaComponent>
                ) : workflowResponse.interrupt?.kind === 'impact_decisions' ? (
                  <>
                    <ImpactoNegocioComponent listaImpacto={workflowResponse.interrupt.payload?.impacto_negocio ?? []} />
                    <WorkflowInterruptionForm
                      key={workflowResponse.interrupt.interrupt_id}
                      interrupt={workflowResponse.interrupt}
                      onResume={resumeWorkflowInterrupt}
                      busy={workflowBusy}
                      error={workflowError}
                      borrador={guardado?.borrador_respuestas}
                      onSaveDraft={guardado?.persistente ? guardarRespuestasSinEnviar : undefined}
                    />
                  </>
                ) : workflowResponse.results?.technical_assessment ? (
                  <WorkflowResultsPanel results={{ technical_assessment: workflowResponse.results.technical_assessment, impact_decisions: workflowResponse.results.impact_decisions }} />
                ) : (
                  <AlertaComponent type="info" title="Todavía no hay impacto">
                    El Asesor Técnico revisa el impacto cuando el Analista termina y ya no quedan preguntas para Negocio.
                  </AlertaComponent>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <BotonComponent variant="secondary" icon={ArrowLeft} onClick={() => setActiveStep(PASO.PREGUNTAS)}>
                    Atrás
                  </BotonComponent>
                  {(!workflowResponse || workflowResponse.results?.story) && (
                    <BotonComponent variant="primary" icon={ArrowRight} onClick={() => setActiveStep(PASO.HISTORIA)}>
                      Historia (borrador)
                    </BotonComponent>
                  )}
                </div>
              </TarjetaComponent>
            </div>
          )}

          {/* STEP 5: Historia de Usuario */}
          {activeStep === PASO.HISTORIA && (
            <div>
              <TarjetaComponent
                title="Paso 5 — Historia de Usuario Generada"
                subtitle="Visualización de la historia en formato estándar y criterios de aceptación."
              >
                {workflowResponse
                  ? <>
                    <WorkflowResultsPanel results={workflowResponse.results} showStory />
                    {workflowStoryEdited && <AlertaComponent type="warning" title="El contrato PO actual no incluye ediciones de HU">
                      El checkpoint conserva la versión original del Redactor. Para que esta edición sea la que se persista, abandone el checkpoint y continúe por el guardado manual; la decisión del workflow no se enviará.
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <BotonComponent variant="secondary" onClick={() => { setWorkflowResponse(null); setWorkflowError('Se abandonó el checkpoint. La HU continuará por el flujo manual y no se enviará una aprobación LangGraph.'); }}>
                          Abandonar workflow y continuar en modo manual
                        </BotonComponent>
                        <BotonComponent variant="secondary" onClick={refreshWorkflow} disabled={workflowBusy}>
                          Restaurar borrador del checkpoint
                        </BotonComponent>
                      </div>
                    </AlertaComponent>}
                  </>
                  : (
                    <AlertaComponent type="warning" title="Borrador simulado: edítelo antes de continuar">
                      El servicio de workflow no está disponible. Este borrador sigue el flujo manual existente, con generación simulada; edítelo antes de continuar.
                    </AlertaComponent>
                  )}
                <AreaTextoComponent label="Como" id="story-as-a" required rows={2} value={userStory.asA} onChange={(e) => handleUserStoryChange('asA', e.target.value)} />
                <AreaTextoComponent label="Quiero" id="story-i-want" required rows={2} value={userStory.iWant} onChange={(e) => handleUserStoryChange('iWant', e.target.value)} />
                <AreaTextoComponent label="Para" id="story-so-that" required rows={2} value={userStory.soThat} onChange={(e) => handleUserStoryChange('soThat', e.target.value)} />

                {/* Criterios de aceptación: un solo editor con Dado que, Cuando y Entonces */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '1rem' }}>
                    Criterios de Aceptación ({acceptanceCriteria.length})
                  </h4>
                  <EditorCriteriosComponent
                    valor={acceptanceCriteria}
                    alCambiar={setAcceptanceCriteria}
                    prefijoId="nuevo-criterio"
                    error={criteriosValidacion.ok ? '' : criteriosValidacion.error}
                  />
                </div>

                {beneficiosPropuestos && (
                  <AlertaComponent type="info" title="Beneficios propuestos por el agente">
                    Se deducen del requerimiento y de las respuestas de Negocio. Edítelos, agregue o quite los que haga falta antes de aprobar.
                  </AlertaComponent>
                )}
                <CamposPlantillaComponent valor={plantilla} alCambiar={actualizarPlantilla} prefijoId="nueva" />

                {/* Section 14: Preguntas Pendientes */}
                {pendingQuestions.length > 0 && (
                  <div style={{ backgroundColor: 'var(--color-warning-light)', border: '1px solid var(--color-warning-border)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning-text)', fontWeight: '700', marginBottom: '0.5rem' }}>
                      <HelpCircle size={18} />
                      <span>Preguntas pendientes por resolver ({pendingQuestions.length})</span>
                    </div>
                    <ul style={{ paddingLeft: '1.25rem', color: 'var(--color-warning-text)', fontSize: '0.9rem' }}>
                      {pendingQuestions.map((pq, idx) => (
                        <li key={idx} style={{ marginBottom: '0.35rem' }}>{pq}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <BotonComponent variant="secondary" icon={ArrowLeft} onClick={() => setActiveStep(workflowResponse ? PASO.IMPACTO : PASO.PREGUNTAS)}>
                    Atrás
                  </BotonComponent>
                  <BotonComponent variant="primary" icon={ArrowRight} onClick={() => setActiveStep(PASO.APROBACION)} disabled={!storyIsComplete}>
                    Aprobación del Product Owner
                  </BotonComponent>
                </div>
              </TarjetaComponent>
            </div>
          )}

          {/* STEP 6: Aprobación del Product Owner */}
          {activeStep === PASO.APROBACION && (
            <div>
              <TarjetaComponent
                title="Paso 6 — Aprobación del Product Owner"
                subtitle="Solo una persona aprueba. Al aprobar, la HU se guarda en el Repositorio de HU y queda lista para grooming."
              >
                <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
                  <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <h5 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Requerimiento</h5>
                    <p style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{requirementName}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Tipo: {infoType}</p>
                  </div>

                  <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <h5 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Resumen de Elementos</h5>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>✓ Historia redactada</p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>✓ {acceptanceCriteria.length} Criterios de aceptación</p>
                    <p style={{ fontSize: '0.9rem', color: pendingQuestions.length > 0 ? 'var(--color-warning-text)' : 'var(--color-success-text)' }}>
                      {pendingQuestions.length > 0 ? `⚠ ${pendingQuestions.length} Preguntas pendientes` : '✓ Sin preguntas pendientes'}
                    </p>
                  </div>
                </div>

                <div className="story-structure" style={{ marginBottom: '1.5rem' }}>
                  <div className="story-structure__item">
                    <div className="story-structure__label">Como:</div>
                    <div className="story-structure__content">{userStory.asA}</div>
                  </div>
                  <div className="story-structure__item">
                    <div className="story-structure__label">Quiero:</div>
                    <div className="story-structure__content">{userStory.iWant}</div>
                  </div>
                  <div className="story-structure__item">
                    <div className="story-structure__label">Para:</div>
                    <div className="story-structure__content">{userStory.soThat}</div>
                  </div>
                </div>

                <AreaTextoComponent
                  label="Observaciones adicionales"
                  id="observations"
                  rows={3}
                  placeholder="Ingrese notas o consideraciones técnicas para la fase de implementación..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                />

                {pendingQuestions.length > 0 ? (
                  <AlertaComponent type="warning" title="No se puede aprobar con preguntas pendientes">
                    Vuelva al paso 3, envíe las respuestas de Negocio al agente y repita hasta que no queden vacíos.{historiaOrigen ? '' : ' Mientras tanto puede guardar la HU como borrador.'}
                  </AlertaComponent>
                ) : workflowResponse?.interrupt?.kind === 'po_approval' && !workflowStoryEdited ? (
                  <>
                    <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '1rem 0', fontSize: '0.95rem' }}>
                      <input type="checkbox" checked={confirmAnonymized} onChange={(e) => setConfirmAnonymized(e.target.checked)} style={{ marginTop: '0.2rem' }} />
                      <span>Confirmo que revisé la anonimización y que mi selección de Product Owner es deliberada.</span>
                    </label>
                    <WorkflowResultsPanel results={workflowResponse.results} />
                    <WorkflowInterruptionForm
                      interrupt={workflowResponse.interrupt}
                      onResume={resumeWorkflowInterrupt}
                      busy={workflowBusy}
                      error={workflowError}
                      canSubmit={confirmAnonymized}
                    />
                  </>
                ) : workflowResponse?.interrupt?.kind === 'po_approval' && workflowStoryEdited ? (
                  <AlertaComponent type="warning" title="La edición no se enviará a la API de aprobación">
                    Restaure la versión del checkpoint para aprobarla en LangGraph, o abandone el workflow y use el guardado manual disponible en el paso 5. La edición manual nunca se enviará como aprobación del checkpoint.
                  </AlertaComponent>
                ) : workflowResponse?.results?.persistence_result?.status === 'saved' ? (
                  <AlertaComponent type="success" title="HU aprobada y guardada por el backend">
                    {workflowResponse.results.completion_reason}
                  </AlertaComponent>
                ) : workflowResponse ? (
                  <AlertaComponent type={workflowResponse.status === 'cancelled' ? 'warning' : 'info'} title="Este workflow no espera una decisión PO ahora">
                    {workflowResponse.results?.completion_reason || `Etapa actual: ${workflowResponse.stage}.`}
                  </AlertaComponent>
                ) : (
                  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '1rem 0', fontSize: '0.95rem' }}>
                    <input
                      type="checkbox"
                      checked={confirmAnonymized}
                      onChange={(e) => setConfirmAnonymized(e.target.checked)}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <span>
                      Apruebo esta HU como Product Owner y confirmo que no contiene datos personales reales (clientes, identificaciones, pólizas).
                    </span>
                  </label>
                )}

                {approvalError && <AlertaComponent type="danger" title="No se pudo aprobar">{approvalError}</AlertaComponent>}
                {descargaError && <AlertaComponent type="danger" title="No se pudo descargar">{descargaError}</AlertaComponent>}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <BotonComponent variant="secondary" icon={ArrowLeft} onClick={() => setActiveStep(PASO.HISTORIA)}>
                    Atrás
                  </BotonComponent>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <BotonComponent variant="secondary" icon={FileDown} onClick={handleDownloadWord}>
                      Descargar Word
                    </BotonComponent>
                    <BotonComponent variant="secondary" icon={FileDown} onClick={handleDownloadPdf}>
                      Descargar PDF
                    </BotonComponent>
                    {!historiaOrigen && !workflowResponse && (
                      <BotonComponent variant="secondary" icon={Save} onClick={handleSaveDraft}>
                        Guardar borrador
                      </BotonComponent>
                    )}
                    {!workflowResponse && (
                      <BotonComponent variant="primary" icon={CheckCircle2} size="lg" onClick={handleApproveStory} disabled={pendingQuestions.length > 0 || !confirmAnonymized || isApproving}>
                        {isApproving ? 'Guardando...' : 'Aprobar y guardar en el Repositorio'}
                      </BotonComponent>
                    )}
                  </div>
                </div>
              </TarjetaComponent>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Al descartar el borrador se cambia la clave para que el asistente empiece desde cero.
export const CrearHistoriaUsuarioComponent = () => {
  const ubicacion = useLocation();
  return <CrearHistoriaUsuarioContenido key={ubicacion.state?.reiniciar ?? 'inicio'} />;
};
