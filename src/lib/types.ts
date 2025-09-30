
// src/lib/types.ts
import type { Timestamp as ClientTimestamp } from 'firebase/firestore';
import type { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

export const DOC_VECTORS_COLLECTION = 'document_vectors';

export interface Address {
    street: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    complement?: string;
    referencePoint?: string;
}

export interface Conversation {
  id: string;
  name: string; // WhatsApp Pushname
  preferredName?: string | null; // Name given by the user
  lastMessage?: string;
  lastMessageMediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  lastMessageDuration?: string | null;
  updatedAt: AdminTimestamp | ClientTimestamp;
  createdAt: AdminTimestamp | ClientTimestamp;
  profilePicUrl?: string;
  folder: 'inbox' | 'support' | 'archived';
  address?: Address | null;
  pinned?: boolean;
  unreadCount?: number;
  operatorNotes?: string[];
  systemNotes?: string[];
  tags?: string[]; // New field for conversation tags
  isAiActive?: boolean;
  isAiThinking?: boolean;
  lastAiResponse?: string | null;
  interventionReason?: 'technical_failure' | 'user_request' | 'knowledge_miss' | 'lead_qualified';
  pendingMessages?: AppMessage[];
  pendingProcessingAt?: AdminTimestamp | ClientTimestamp; // Timestamp to coordinate debounce logic
  retryProfilePicAt?: AdminTimestamp | ClientTimestamp; // Timestamp to retry fetching profile picture
  aiSummary?: string | null; // AI-generated summary of the conversation
  followUpState?: {
      nextFollowUpAt: AdminTimestamp | ClientTimestamp;
      step: 'first' | 'second' | 'third';
  } | null;
  lastFollowUpSent?: 'first' | 'second' | 'third' | null;
}

export interface AppMessage {
  id: string;
  text: string;
  from: 'user' | 'agent';
  timestamp: ClientTimestamp | AdminTimestamp;
  updatedAt?: ClientTimestamp | AdminTimestamp;
  type?: 'chat' | 'system' | 'media';
  apiPayload?: any;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | null;
  imageDataUri?: string | null; // Added to hold image data for AI processing
  transcription?: string | null;
  transcriptionStatus?: 'pending' | 'success' | 'failed' | null;
  source?: 'ai' | 'operator' | 'system' | 'tool';
  status?: 'sending' | 'sent' | 'delivered' | 'failed';
  duration?: string | null;
  apiResponse?: any;
  operatorEmail?: string;
  mimetype?: string | null;
  ackPayload?: any;
  toolRequests?: any[];
  toolResponses?: any[];
}

export interface FollowUpStep {
    enabled: boolean;
    intervalHours: number;
    message: string;
}

export interface AutomationSettings {
    isAiActive: boolean;
    sendOutOfHoursMessage: boolean;
    outOfHoursMessage: string;
    isBusinessHoursEnabled?: boolean;
    autoClearLogs?: boolean;
    isMessageGroupingEnabled?: boolean;
    messageGroupingInterval?: number;
    isDevModeEnabled?: boolean;
    aiTemperature?: number;
    isFollowUpEnabled?: boolean;
    followUps?: {
        first: FollowUpStep;
        second: FollowUpStep;
        third: FollowUpStep;
    };
}

export interface AiConfig {
    companyName?: string;
    businessDescription?: string;
    agentRole?: 'Suporte / Tirar Dúvidas' | 'Agendar / Marcar Horários' | 'SDR (Qualificar Leads)' | 'Roteamento / Triagem';
    agentPersonality?: 'Amigável e casual' | 'Profissional e formal' | 'Divertido e criativo' | 'Técnico e preciso' | 'Empático e paciente' | 'Curto e direto';
    useEmojis?: boolean;
    useGreeting?: boolean;
    contactPhone?: string;
    contactEmail?: string;
    agentObjective?: string;
    fullPrompt: string; // The final, generated prompt
    targetAudience?: string;
    keyProducts?: string;
    commonMistakes?: string;
    humanizationTriggers?: string;
    fixedLinks?: string;
    unknownAnswerResponse?: string;
    qualifyingQuestions?: string[];
    routingSectors?: string[]; // New field for routing agent
    surveyQuestions?: string;
    notifyOnTagAdded?: boolean; // New field for routing agent notifications
}


export interface WebhookLog {
  id: string;
  source: 'evolution' | 'google';
  status: string;
  payload: any;
  error?: string | null;
  receivedAt: AdminTimestamp | ClientTimestamp;
}

export interface AiLog {
    id: string;
    flow: string;
    prompt: string | object;
    systemPrompt?: string; // Add systemPrompt to the type
    response: any;
    responseText?: string;
    toolRequests?: any[];
    error: any;
    context: any;
    modelName?: string;
    timestamp: AdminTimestamp | ClientTimestamp;
}

export interface SystemLog {
    id: string;
    component: string;
    level: 'info' | 'error';
    message?: string;
    error?: any;
    context: any;
    timestamp: AdminTimestamp | ClientTimestamp;
}

export interface DisplaySettings {
    chatFontSize: number;
    activeTheme?: 'default' | 'experimental' | 'matrix' | 'light' | 'solarized-dark';
    notificationsEnabled?: boolean;
}

export interface ConnectionStatus {
    status: 'connected' | 'disconnected' | 'connecting';
    reason?: 'logout' | 'error' | 'initial';
    instance?: string;
    disconnectedAt?: AdminTimestamp | ClientTimestamp;
}

export const WebhookEventSchema = z.enum([
    'conversation_created',
    'conversation_updated',
    'message_received',
    'message_sent',
    'human_support_requested',
    'appointment_scheduled',
    'appointment_rescheduled_or_canceled',
    'client_info_updated',
    'lead_qualified',
    'ai_knowledge_miss',
    'conversation_ended_by_ai',
    'tag_added', // New event
    'test_event',
]);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export interface ActionConfig {
    id: string;
    name: string;
    type: 'webhook' | 'whatsapp';
    event: WebhookEvent;
    isActive: boolean;
    createdAt: AdminTimestamp | ClientTimestamp;
    
    // Webhook-specific fields
    url?: string;
    secret?: string;
    
    // WhatsApp-specific fields
    phoneNumber?: string;
    messageTemplate?: string;

    // Event-specific fields
    triggerTags?: string[];
}

// Schemas for server actions & flows
export const SenderInputSchema = z.object({
  userId: z.string().describe('The user ID in Firestore.'),
  phone: z.string().describe('The recipient\'s phone number.'),
  message: z.string().describe('The message content to send.'),
  source: z.enum(['ai', 'operator', 'system']).optional().describe('The source of the message.'),
  operatorEmail: z.string().optional().describe('The email of the operator sending the message.'),
});
export type SenderInput = z.infer<typeof SenderInputSchema>;

export const SenderOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});
export type SenderOutput = z.infer<typeof SenderOutputSchema>;


export const TranscribeAudioInputSchema = z.object({
  userId: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  audioData: z.string().describe("O conteúdo do áudio em Base64, incluindo o mime type. Ex: 'data:audio/ogg;base64,...'"),
});
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

export const TranscribeAudioOutputSchema = z.object({
  transcription: z.string().nullable().describe('The transcribed text from the audio.'),
});
export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;


export const ProcessConversationInputSchema = z.object({
  userId: z.string(),
  conversation: z.custom<Conversation>()
});
export type ProcessConversationInput = z.infer<typeof ProcessConversationInputSchema>;

export interface FaqItem {
    id: string;
    question: string;
    answer: string;
    createdAt: AdminTimestamp | ClientTimestamp;
}

export interface KnowledgeBaseItem {
    id: string;
    name: string;
    description: string;
    type: 'product' | 'faq';
    price?: number;
    imageUrls?: string[];
    createdAt: AdminTimestamp | ClientTimestamp;
}


export interface ProductItem {
    id: string;
    name: string;
    description: string;
    price?: number;
    imageUrls?: string[];
    createdAt: AdminTimestamp | ClientTimestamp;
}

export interface SyncedDocument {
    id: string;
    name: string;
    status: 'pending' | 'syncing' | 'synced' | 'error';
    progress?: number;
    chunkCount?: number;
    lastSynced?: string;
    createdAt: AdminTimestamp | ClientTimestamp;
    error?: string;
}

// --- Agent Prompt Generation Schemas ---
export const GenerateAgentPromptInputSchema = z.object({
  userId: z.string().describe('The ID of the user for whom the prompt is being generated.'),
  mode: z.enum(['simple', 'advanced']).describe('The configuration mode used.'),
  companyName: z.string().optional().describe('The name of the business.'),
  businessDescription: z.string().describe('A description of what the business does.'),
  agentRole: z.string().describe('The main function or role of the AI agent.'),
  agentPersonality: z.string().optional().describe("The agent's personality (e.g., 'Amigável', 'Profissional')."),
  useEmojis: z.boolean().optional().describe('Whether the agent should use emojis.'),
  useGreeting: z.boolean().optional().describe('Whether the agent should use a standard greeting.'),
  contactPhone: z.string().optional().describe('The business contact phone number.'),
  contactEmail: z.string().optional().describe('The business contact email address.'),
  agentObjective: z.string().optional().describe('The main goal the agent should try to achieve in a conversation.'),
  targetAudience: z.string().optional().describe('Description of the ideal customer.'),
  keyProducts: z.string().optional().describe('Products or services to highlight.'),
  commonMistakes: z.string().optional().describe('What the agent must not do.'),
  humanizationTriggers: z.string().optional().describe('Situations that require immediate human intervention.'),
  fixedLinks: z.string().optional().describe('Important links to provide to customers.'),
  unknownAnswerResponse: z.string().optional().describe('The default response when the AI does not know the answer.'),
  qualifyingQuestions: z.array(z.string()).optional().describe('The questions the AI should ask to qualify a lead.'),
  routingSectors: z.array(z.string()).optional().describe('The sectors/tags for the routing agent.'),
  surveyQuestions: z.string().optional().describe('The questions the AI should ask to conduct a survey.'),
  notifyOnTagAdded: z.boolean().optional().describe('Whether to send a push notification when the routing agent adds a tag.'),
});
export type GenerateAgentPromptInput = z.infer<typeof GenerateAgentPromptInputSchema>;

export const GenerateAgentPromptOutputSchema = z.object({
  success: z.boolean(),
  prompt: z.string().optional().describe('The full, structured system prompt generated by the AI.'),
  feedback: z.string().optional().describe('AI-generated feedback on the quality and safety of the prompt.'),
  error: z.string().optional(),
});
export type GenerateAgentPromptOutput = z.infer<typeof GenerateAgentPromptOutputSchema>;


// --- Field Suggestion Generation Schemas ---
export const GenerateFieldSuggestionInputSchema = z.object({
  userId: z.string(),
  businessDescription: z.string(),
  agentRole: z.string(),
  fieldName: z.enum(['commonMistakes', 'humanizationTriggers']),
});
export type GenerateFieldSuggestionInput = z.infer<typeof GenerateFieldSuggestionInputSchema>;

export const GenerateFieldSuggestionOutputSchema = z.object({
  success: z.boolean(),
  suggestion: z.string().optional(),
  error: z.string().optional(),
});
export type GenerateFieldSuggestionOutput = z.infer<typeof GenerateFieldSuggestionOutputSchema>;

export interface AiProviderSettings {
    apiKey?: string;
    primaryModel?: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.0-flash' | 'gemini-2.0-flash-lite';
    isFallbackEnabled?: boolean;
}
