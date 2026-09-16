import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { request } from './bridge.mjs';

const require = createRequire(import.meta.url);
const { guide } = require('../src/ai-workflow.js');
const token = z.string().min(1).describe('stateToken from the latest get_project or successful edit. A stale token is rejected.');
const absolutePath = z.string().min(1).describe('Absolute local file path.');
const label = z.string().min(1).max(200).describe('Human-readable purpose of this editing step.');
const edits = z.array(z.record(z.string(), z.unknown())).min(1).max(256).describe('Editor commands. Call editing_guide first; times are integer frames.');
const definitions = [
  ['get_project', 'Read the current project, asset/track/item IDs, captions, revision and stateToken. Read before editing.', {}, true],
  ['list_projects', 'List projects in the editor workspace.', {}, true],
  ['new_project', 'Start a blank project. Automatically checkpoints the currently open project.', {stateToken:token,settings:z.object({width:z.number().int().min(16).max(7680),height:z.number().int().min(16).max(7680),rate:z.object({num:z.number().int().positive().max(240000),den:z.number().int().positive().max(10000)})})}],
  ['open_project', 'Open an .akbunvideo file. Automatically checkpoints the current project.', {stateToken:token,path:absolutePath}],
  ['import_media', 'Probe and reference existing local video/audio/image files in the project. Does not copy originals.', {stateToken:token,paths:z.array(absolutePath).min(1).max(100)}],
  ['preview_edits', 'Validate a command batch without changing the project.', {stateToken:token,commands:edits}, true],
  ['apply_edits', 'Apply a command batch immediately as one undo step. Durably checkpoints the project BEFORE editing and returns checkpointId.', {stateToken:token,label,commands:edits}],
  ['create_checkpoint', 'Remember the current project before a multi-step task. Keep this ID to roll back the entire task, including after app restart.', {label}],
  ['list_checkpoints', 'List the newest 100 persistent recovery points. Older known IDs remain restorable.', {}, true],
  ['restore_checkpoint', 'Restore a whole project from a recovery point. Saves the current project first; clears ordinary undo history. Does not overwrite project files or restore source media.', {stateToken:token,checkpointId:z.string().regex(/^[0-9-]+$/)}],
  ['undo', 'Undo the most recent editor operation, including manual edits. Read current state first.', {stateToken:token}],
  ['redo', 'Redo the last undone editor operation.', {stateToken:token}],
  ['save_project', 'Atomically save as .akbunvideo. Existing valid project file gets a recovery point before replacement.', {stateToken:token,path:absolutePath}],
  ['sample_asset', 'Return up to 8 JPEG frames from an imported video interval of at most 60 seconds, or one frame for an image. Inspect these for B-roll; unsampled motion and sound are unknown.', {assetId:z.string().min(1),startMs:z.number().int().nonnegative(),endMs:z.number().int().nonnegative()}, true],
  ['get_library', 'Read saved reusable graphic templates and B-roll observations. Reuse assets only if available in the current project.', {}, true],
  ['export_video', 'Start rendering to a NEW video path using existing ffmpeg/render settings. Poll render_status to verify success.', {stateToken:token,path:absolutePath,preset:z.enum(['fhd','4k'])}],
  ['render_status', 'Read current export state and its completion result. Success requires result.ok=true.', {}, true],
  ['cancel_render', 'Request cancellation of the running export.', {}],
];

export function createServer(call = request) {
  const server = new McpServer({ name:'akbun-makevideo', version:require('../package.json').version }, {instructions:'Control the running local editor. Start with editing_guide and get_project. Create a named checkpoint before each user task and retain its ID. Read media/captions rather than inventing content. Apply edits directly; do not ask the user to click Apply. Read fresh state after a stale-token error. Check render_status for export success.'});
  server.registerTool('editing_guide', {description:'Read command formats, timing rules and recovery workflow before editing.',inputSchema:z.object({}),annotations:{readOnlyHint:true}}, async () => ({content:[{type:'text',text:guide + '\nMCP: put command objects directly in apply_edits.commands (not JSON strings). Checkpoint before a multi-step task; every apply also automatically saves its immediate before-state. Create captions with addVisualItem on a subtitle track, content.kind=text. Restore a checkpoint then save_project explicitly to update the disk file.'}]}));
  for (const [name, description, shape, readOnly = false] of definitions) {
    server.registerTool(name, {description,inputSchema:z.object(shape),annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:false}}, async (args) => {
      try {
        const result = await call(name, args);
        if (name === 'sample_asset') {
          const {frames,...metadata} = result;
          return {content:[{type:'text',text:JSON.stringify(metadata)}, ...frames.flatMap(frame => [{type:'text',text:`Source time: ${frame.timeMs} ms`},{type:'image',data:frame.url.split(',')[1],mimeType:'image/jpeg'}])]};
        }
        return {content:[{type:'text',text:JSON.stringify(result)}]};
      } catch (error) { return {isError:true,content:[{type:'text',text:error.message}]}; }
    });
  }
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await serveStdio(() => createServer());
