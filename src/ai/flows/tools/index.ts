

import { z } from 'zod';
import { cancelAppointmentToolDef, cancelAppointmentSerializableToolDef } from './cancelAppointmentTool';
import { endConversationToolDef, endConversationSerializableToolDef } from './endConversationTool';
import { getAvailableSlotsToolDef, getAvailableSlotsSerializableToolDef } from './getAvailableSlotsTool';
import { listEventsToolDef, listEventsSerializableToolDef } from './listEventsTool';
import { requestHumanSupportToolDef, requestHumanSupportSerializableToolDef } from './requestHumanSupportTool';
import { scheduleAppointmentToolDef, scheduleAppointmentSerializableToolDef } from './scheduleAppointmentTool';
import { summarizeConversationToolDef, summarizeConversationSerializableToolDef } from './summarizeConversationTool';
import { updateClientInfoToolDef, updateClientInfoSerializableToolDef } from './updateClientInfoTool';
import { updateConversationTagsToolDef, updateConversationTagsSerializableToolDef } from './updateConversationTagsTool';
import { sendMediaMessageToolDef, sendMediaMessageSerializableToolDef } from './sendMediaMessageTool';
import { silentTools } from '@/lib/schemas';


/**
 * Interface for the full tool definition, including the server-side function.
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: z.ZodObject<any, any, any>;
    isSilent: boolean;
    fn: (input: any, context: { userId: string, conversationId: string }) => Promise<any>;
}

/**
 * Interface to define the structure of our tool definitions,
 * making them easy to consume by client-side components.
 */
export interface SerializableToolDefinition {
    name: string;
    description: string;
    inputSchema: z.ZodObject<any, any, any>;
}

/**
 * A central export point for all available AI tool definitions for the SERVER.
 * This array is used by the main conversation flow to provide the AI
 * with its full set of capabilities and to execute the requested functions.
 */
export const allToolDefs: ToolDefinition[] = [
    cancelAppointmentToolDef,
    endConversationToolDef,
    getAvailableSlotsToolDef,
    listEventsToolDef,
    requestHumanSupportToolDef,
    scheduleAppointmentToolDef,
    summarizeConversationToolDef,
    updateClientInfoToolDef,
    updateConversationTagsToolDef,
    sendMediaMessageToolDef,
];

/**
 * A central export point for all tool schemas, safe for CLIENT-side consumption.
 * This array is used by UI components to display tool documentation
 * without importing server-side code.
 */
export const allSerializableToolDefs: (SerializableToolDefinition & { isSilent: boolean })[] = [
    cancelAppointmentSerializableToolDef,
    endConversationSerializableToolDef,
    getAvailableSlotsSerializableToolDef,
    listEventsSerializableToolDef,
    requestHumanSupportSerializableToolDef,
    scheduleAppointmentSerializableToolDef,
    summarizeConversationSerializableToolDef,
    updateClientInfoSerializableToolDef,
    updateConversationTagsSerializableToolDef,
    sendMediaMessageSerializableToolDef,
].map(tool => ({
    ...tool,
    isSilent: silentTools.includes(tool.name)
}));
