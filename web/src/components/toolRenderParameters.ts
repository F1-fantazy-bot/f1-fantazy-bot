import { z } from 'zod';

// Render-only registrations must retain arguments used by choice cards and
// workflow result placement. Backend tools own validation and execution.
export const toolRenderParameters = z.object({}).passthrough();
