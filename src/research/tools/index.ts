/**
 * Punto de entrada de las herramientas de investigación M3.
 */

export * from './SearchTool.ts';
export { SearxngSearchTool, DEFAULT_SEARXNG_URL, searxngBaseUrl } from './SearxngSearchTool.ts';
export { HttpFetchTool, htmlToText } from './HttpFetchTool.ts';
export {
  RecordingSearchTool,
  RecordingFetchTool,
  ReplaySearchTool,
  ReplayFetchTool,
  readToolRecording,
  writeToolRecording,
  searchKey,
  fetchKey,
  TOOL_RECORDING_KIND,
} from './RecordReplay.ts';
export type { ToolRecording, SearchRecordingEntry, FetchRecordingEntry } from './RecordReplay.ts';
