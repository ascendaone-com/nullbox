import { spawn } from "node:child_process";

/**
 * Opens a /dev/null link in the browser: `open` on macOS, `xdg-open` elsewhere. Only links on the /dev/null being used
 * are opened, whatever a commit's html_url says. Returns false when there's no browser to open, such as over SSH, so
 * the caller can show the link instead.
 */
export function openInBrowser(url: string, baseUrl: string): boolean {
  if (!url.startsWith(`${new URL(baseUrl).origin}/`)) return false;
  if (process.env.SSH_CONNECTION) return false;

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(command, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
