// api/_integrationFixMap.ts
// Underscore prefix → Vercel won't expose this as a route.
// Static metadata: how to fix each known-fragile HA integration, by tier.

export type IntegrationFix = {
  id: string;                 // logical id used in health-check + ha-fix ?integration=
  label: string;              // human name for alerts / UI
  tier: 1 | 2 | 3;            // 1 = full auto, 2 = paste-one-secret, 3 = assisted
  action?: 'reload_config_entry' | 'restart_addon';
  addonSlug?: string;         // for restart_addon (Supervisor addon slug)
  configEntryDomain?: string; // for reload_config_entry (HA integration domain)
  keyUrl?: string;            // Tier 2/3: where the human gets a fresh credential
  haReconfigPath?: string;    // Tier 2/3: HA deep-link path (appended to HOME_ASSISTANT_URL)
  prefillUser?: string;       // Tier 3: username to prefill in the assisted flow
};

export const FIX_MAP: Record<string, IntegrationFix> = {
  wyze_bridge: {
    id: 'wyze_bridge',
    label: 'Wyze Cameras (docker-wyze-bridge)',
    tier: 1,
    action: 'restart_addon',
    addonSlug: 'docker-wyze-bridge', // NOTE: verify exact slug in Task 1 Step 3
  },
  google_ai: {
    id: 'google_ai',
    label: 'Google AI (Gemini)',
    tier: 2,
    action: 'reload_config_entry',
    configEntryDomain: 'google_generative_ai_conversation',
    keyUrl: 'https://aistudio.google.com/apikey',
    haReconfigPath: '/config/integrations/integration/google_generative_ai_conversation',
  },
  alexa: {
    id: 'alexa',
    label: 'Alexa Media Player',
    tier: 3,
    keyUrl: 'https://www.amazon.com/ap/signin',
    haReconfigPath: '/config/integrations/integration/alexa_media',
    prefillUser: 'michael711hebert@gmail.com',
  },
};

const GENERIC_FALLBACK = (id: string): IntegrationFix => ({
  id,
  label: id,
  tier: 3,
  haReconfigPath: '/config/integrations',
});

export function resolveFix(integrationId: string): IntegrationFix {
  return FIX_MAP[integrationId] ?? GENERIC_FALLBACK(integrationId);
}
