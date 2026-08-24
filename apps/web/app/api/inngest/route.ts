import { pipelineInngest, pipelineInngestFunctions } from '@wingman/pipeline'
import { serve } from 'inngest/next'

export const { GET, POST, PUT } = serve({
  client: pipelineInngest,
  functions: pipelineInngestFunctions,
})
