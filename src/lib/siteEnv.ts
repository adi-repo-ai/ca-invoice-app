/**
 * True on a Netlify test address: branch deploys ("staging--site.netlify.app")
 * and deploy previews ("deploy-preview-12--site.netlify.app"). The live site
 * ("site.netlify.app" or a custom domain) never has "--" in its host name.
 */
export function isTestHost(hostname: string): boolean {
  return /--[^.]+\.netlify\.app$/i.test(hostname);
}
