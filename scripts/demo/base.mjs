// Chooses the parent folder for the synthetic demo. Pure helper so it can be unit-tested.
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// macOS limits Unix socket paths to 103 bytes; keep a margin below that for Kiro's IPC socket names.
export const SOCKET_PATH_BUDGET = 100;
const MKDTEMP_TEMPLATE = 'synthetic-bobert-demo-XXXXXX';

export function demoParentDir({
 platform = process.platform,
 tmp = tmpdir(),
 realpath = (path) => realpathSync.native(path),
} = {}) {
 if (platform !== 'darwin') return tmp;
 const socketPath = join(realpath(tmp), MKDTEMP_TEMPLATE, 'user-data', '1.000-main.sock');
 if (socketPath.length <= SOCKET_PATH_BUDGET) return tmp;
 return realpath('/tmp');
}

/** Default Kiro IDE executables per platform (the same list open.mjs uses; that file is copied standalone into the demo folder). */
export function kiroExecutableCandidates({ platform = process.platform, env = process.env } = {}) {
 if (platform === 'darwin') return ['/Applications/Kiro.app/Contents/MacOS/Kiro'];
 if (platform === 'win32') return [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Kiro', 'Kiro.exe'), env.ProgramFiles && join(env.ProgramFiles, 'Kiro', 'Kiro.exe')].filter(Boolean);
 return ['/usr/share/kiro/kiro', '/opt/Kiro/kiro', '/opt/kiro/kiro'];
}

/** Command-line wrappers next to a Kiro IDE executable: they install an extension into a given profile without opening a window. */
export function kiroCliCandidates(executable, platform = process.platform) {
 const dir = dirname(executable);
 if (platform === 'darwin') return [join(dir, '..', 'Resources', 'app', 'bin', 'code')];
 if (platform === 'win32') return [join(dir, 'bin', 'kiro.cmd'), join(dir, 'bin', 'code.cmd')];
 return [join(dir, 'bin', 'kiro'), join(dir, 'resources', 'app', 'bin', 'code')];
}
