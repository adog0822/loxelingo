/**
 * The teaching loop: learn, teach, the avatar attempts, settle.
 *
 * `./contract.ts` is the authority on the mechanic and its scoring model. Read the isolation
 * rule there before touching anything in this directory. See also docs/design/teaching.md.
 */
export {
  type AttemptInput,
  type AttemptResult,
  type LearnSegment,
  type NoSettleReason,
  type Stage,
  stageIndex,
  STAGES,
  TEACHING_RESPECTS_CALIBRATION_GATE,
  type TeachingOutcome,
} from './contract'

export {
  ATTEMPT_PROMPT_PARTS,
  ATTEMPT_PROMPT_VERSION,
  buildAttemptPrompt,
  TeachingPromptError,
} from './prompt'

export {
  attemptConfig,
  JudgeBudgetExhausted,
  JudgeRateLimited,
  type RunAttemptOptions,
  type RunAttemptResult,
  runAttempt,
  TEACHING_CONFIG_VERSION,
  teachingModelVersion,
} from './attempt'

export {
  acceptedAnswers,
  type AnswerKey,
  AnswerKeyError,
  type ChoiceAnswerKey,
  type ExactAnswerKey,
  isCorrectAnswer,
  normalizeAnswer,
  parseAnswerKey,
} from './answer-key'

export {
  applyTeachingResult,
  assertNet,
  NET_MAX,
  netAtStageFloor,
  StageError,
  type StageMove,
  stageFromDb,
  stageFromNet,
  stageProgress,
  stageToDb,
  STEPS_PER_STAGE,
} from './stage'

export {
  type AttemptProvenance,
  createSupabaseTeachingStore,
  pairingUncertainty,
  type SettleTeachingOptions,
  settleTeachingSession,
  type TeachingPairing,
  TeachingError,
  type TeachingSessionInput,
  type TeachingSessionRow,
  type TeachingStore,
  teachingRatingsMove,
} from './session'
