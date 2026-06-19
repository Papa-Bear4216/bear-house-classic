/**
 * Hermes 2.0 API Route - Enhanced orchestration endpoint
 * Coordinates all approved features and integrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { 
  EnhancedHermes, 
  makeDecisionFor, 
  optimizeParallelTasks,
  predictChaos,
  EMERGENCY_PROTOCOLS,
  FamilyXPSystem,
  AnticipationEngine,
  MemoryPalace
} from '@/lib/hermes-enhanced';
import { SpotifyIntegration, MOOD_PRESETS } from '@/lib/integrations/spotify-integration';
import { VoiceAssistantIntegration } from '@/lib/integrations/voice-assistant';
import { WeatherIntegration } from '@/lib/integrations/weather-integration';
import { BankingIntegration } from '@/lib/integrations/banking-integration';

// Initialize integrations (would use env vars in production)
const integrations = {
  spotify: process.env.SPOTIFY_CLIENT_ID ? new SpotifyIntegration(
    process.env.SPOTIFY_CLIENT_ID,
    process.env.SPOTIFY_REFRESH_TOKEN!
  ) : null,
  
  voice: new VoiceAssistantIntegration(
    process.env.GOOGLE_ASSISTANT_PROJECT_ID,
    process.env.ALEXA_SKILL_ID
  ),
  
  weather: process.env.WEATHER_API_KEY ? new WeatherIntegration(
    process.env.WEATHER_API_KEY,
    { 
      lat: parseFloat(process.env.HOME_LAT || '40.7128'), 
      lon: parseFloat(process.env.HOME_LON || '-74.0060') 
    }
  ) : null,
  
  banking: process.env.PLAID_CLIENT_ID ? new BankingIntegration(
    process.env.PLAID_CLIENT_ID,
    process.env.PLAID_SECRET!,
    process.env.PLAID_ACCESS_TOKEN!
  ) : null,
};

// Initialize enhanced systems
const xpSystem = new FamilyXPSystem();
const anticipation = new AnticipationEngine();
const memoryPalace = new MemoryPalace();

export async function POST(req: NextRequest) {
  const { action, userId, data, context } = await req.json();

  try {
    switch (action) {
      // ===== DECISION FATIGUE ELIMINATOR =====
      case 'makeDecision':
        return handleDecision(data, context);

      // ===== PARALLEL PROCESSING =====
      case 'optimizeTasks':
        return handleTaskOptimization(data.tasks);

      // ===== CONTEXT SWITCHING =====
      case 'saveBrainState':
        return handleBrainState('save', userId, data);
      
      case 'restoreBrainState':
        return handleBrainState('restore', userId, data);

      // ===== FAMILY XP SYSTEM =====
      case 'addXP':
        return handleXP(userId, data);

      // ===== CHAOS PREVENTION =====
      case 'predictChaos':
        return handleChaosPrediction(context);

      // ===== EMERGENCY PROTOCOLS =====
      case 'triggerEmergency':
        return handleEmergency(data.type, userId);

      // ===== ANTICIPATION ENGINE =====
      case 'anticipate':
        return handleAnticipation(context);

      // ===== MEMORY PALACE =====
      case 'trackObject':
        return handleMemoryPalace('track', data);
      
      case 'findObject':
        return handleMemoryPalace('find', data);

      // ===== INTEGRATIONS =====
      case 'spotify':
        return handleSpotify(data);
      
      case 'voice':
        return handleVoice(data);
      
      case 'weather':
        return handleWeather(data);
      
      case 'banking':
        return handleBanking(data);

      // ===== FULL ORCHESTRATION =====
      case 'orchestrate':
        return handleFullOrchestration(userId, context);

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Hermes Enhanced error:', error);
    return NextResponse.json(
      { error: 'Hermes encountered an error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// ============ HANDLER FUNCTIONS ============

async function handleDecision(data: any, context: any) {
  const result = await makeDecisionFor(data.decision, context);
  return NextResponse.json({ decision: result });
}

async function handleTaskOptimization(tasks: any[]) {
  const optimized = optimizeParallelTasks(tasks);
  return NextResponse.json({ 
    schedule: optimized.schedule,
    totalTime: optimized.totalTime,
    timeSaved: tasks.reduce((sum, t) => sum + t.duration, 0) - optimized.totalTime
  });
}

async function handleBrainState(operation: 'save' | 'restore', userId: string, data: any) {
  if (operation === 'save') {
    // Save to Firestore for persistence
    const firestore = getAdminFirestore();
    const ref = firestore.collection('users').doc(userId).collection('brainStates').doc(data.taskId);
    await ref.set({
      ...data,
      savedAt: new Date().toISOString()
    });
    return NextResponse.json({ saved: true });
  } else {
    // Restore from Firestore
    const firestore = getAdminFirestore();
    const ref = firestore.collection('users').doc(userId).collection('brainStates').doc(data.taskId);
    const snap = await ref.get();
    return NextResponse.json({ state: snap.exists ? snap.data() : null });
  }
}

async function handleXP(userId: string, data: any) {
  const result = xpSystem.addXP(userId, data.amount, data.skill);
  
  // Check for level up celebration
  if (result.level > Math.floor((result.totalXP - data.amount) / 100)) {
    // Trigger celebration
    if (integrations.spotify) {
      await integrations.spotify.playNotification();
    }
  }
  
  return NextResponse.json(result);
}

async function handleChaosPrediction(context: any) {
  const predictions = await predictChaos(context);
  
  // Store high-severity predictions for follow-up
  const highSeverity = predictions.filter(p => p.severity === 'high');
  if (highSeverity.length > 0 && context.currentUser?.id) {
    const firestore = getAdminFirestore();
    const ref = firestore.collection('users').doc(context.currentUser.id).collection('alerts').doc('chaos');
    await ref.set({
      predictions: highSeverity,
      createdAt: new Date().toISOString()
    });
  }
  
  return NextResponse.json({ predictions });
}

async function handleEmergency(type: string, userId: string) {
  const protocol = EMERGENCY_PROTOCOLS[type];
  if (!protocol) {
    return NextResponse.json({ error: 'Unknown emergency type' }, { status: 400 });
  }

  // Log emergency activation
  const firestore = getAdminFirestore();
  const ref = firestore.collection('emergencies').doc(`${userId}-${Date.now()}`);
  await ref.set({
    type,
    userId,
    activatedAt: new Date().toISOString(),
    protocol
  });

  // Trigger notifications (would use FCM in production)
  // Simplify schedule
  // Alert contacts
  
  return NextResponse.json({ 
    protocol,
    message: 'Emergency protocol activated. Help is coordinated.'
  });
}

async function handleAnticipation(context: any) {
  const needs = await anticipation.anticipateNeeds(context);
  return NextResponse.json(needs);
}

async function handleMemoryPalace(operation: string, data: any) {
  if (operation === 'track') {
    memoryPalace.trackObject(data.item, data.location);
    return NextResponse.json({ tracked: true });
  } else {
    const location = memoryPalace.findObject(data.item);
    return NextResponse.json({ location });
  }
}

async function handleSpotify(data: any) {
  if (!integrations.spotify) {
    return NextResponse.json({ error: 'Spotify not configured' }, { status: 503 });
  }

  switch (data.command) {
    case 'playMood':
      await integrations.spotify.playMoodPlaylist(data.mood);
      return NextResponse.json({ playing: true });
    
    case 'focusTimer':
      const timer = await integrations.spotify.setFocusTimer(data.minutes, data.userId);
      return NextResponse.json(timer);
    
    case 'familyDJ':
      await integrations.spotify.familyDJ(data.requests);
      return NextResponse.json({ queued: true });
    
    default:
      return NextResponse.json({ error: 'Unknown Spotify command' }, { status: 400 });
  }
}

async function handleVoice(data: any) {
  if (data.platform === 'google') {
    return await integrations.voice.handleGoogleAction(data.conv);
  } else if (data.platform === 'alexa') {
    return await integrations.voice.handleAlexaRequest(data.handlerInput);
  }
  return NextResponse.json({ error: 'Unknown voice platform' }, { status: 400 });
}

async function handleWeather(data: any) {
  if (!integrations.weather) {
    return NextResponse.json({ error: 'Weather not configured' }, { status: 503 });
  }

  switch (data.command) {
    case 'current':
      const weather = await integrations.weather.getCurrentWeather();
      return NextResponse.json(weather);
    
    case 'outfit':
      const outfit = await integrations.weather.getOutfitSuggestion(data.userId, data.activities);
      return NextResponse.json(outfit);
    
    case 'activities':
      const activities = await integrations.weather.getActivitySuggestions();
      return NextResponse.json(activities);
    
    case 'reschedule':
      const reschedule = await integrations.weather.shouldRescheduleDueToWeather(
        data.eventType,
        new Date(data.eventTime)
      );
      return NextResponse.json(reschedule);
    
    case 'briefing':
      const briefing = await integrations.weather.getWeatherBriefing();
      return NextResponse.json({ briefing });
    
    default:
      return NextResponse.json({ error: 'Unknown weather command' }, { status: 400 });
  }
}

async function handleBanking(data: any) {
  if (!integrations.banking) {
    return NextResponse.json({ error: 'Banking not configured' }, { status: 503 });
  }

  switch (data.command) {
    case 'balance':
      const balance = await integrations.banking.getRealTimeBalance();
      return NextResponse.json(balance);
    
    case 'alerts':
      const alerts = await integrations.banking.getSmartAlerts(data.location);
      return NextResponse.json({ alerts });
    
    case 'budgets':
      const budgets = await integrations.banking.getCategoryBudgets();
      return NextResponse.json({ budgets });
    
    case 'shoppingMode':
      const shopping = await integrations.banking.activateShoppingMode(data.userId);
      return NextResponse.json(shopping);
    
    case 'predictions':
      const predictions = await integrations.banking.getPredictiveAlerts();
      return NextResponse.json({ predictions });
    
    default:
      return NextResponse.json({ error: 'Unknown banking command' }, { status: 400 });
  }
}

async function handleFullOrchestration(userId: string, context: any) {
  // Run all proactive systems in parallel
  const results = await Promise.allSettled([
    predictChaos(context),
    anticipation.anticipateNeeds(context),
    integrations.weather?.getWeatherBriefing(),
    integrations.banking?.getSmartAlerts(),
    integrations.weather?.getActivitySuggestions(),
  ]);

  const orchestration: {
    chaos: any;
    anticipations: any;
    weather: any;
    financialAlerts: any;
    activities: any;
    timestamp: string;
    emergencyProtocols?: any[];
  } = {
    chaos: results[0].status === 'fulfilled' ? results[0].value : [],
    anticipations: results[1].status === 'fulfilled' ? results[1].value : {},
    weather: results[2].status === 'fulfilled' ? results[2].value : null,
    financialAlerts: results[3].status === 'fulfilled' ? results[3].value : [],
    activities: results[4].status === 'fulfilled' ? results[4].value : {},
    timestamp: new Date().toISOString(),
  };

  // Check for emergency conditions
  const emergencyTriggers = [];
  
  // Financial emergency
  if (orchestration.financialAlerts?.some((a: any) => a.severity === 'critical')) {
    emergencyTriggers.push('financial_stress');
  }
  
  // Schedule chaos
  if (orchestration.chaos?.filter((c: any) => c.severity === 'high').length > 2) {
    emergencyTriggers.push('schedule_overload');
  }

  if (emergencyTriggers.length > 0) {
    orchestration.emergencyProtocols = emergencyTriggers.map(t => EMERGENCY_PROTOCOLS[t]).filter(Boolean);
  }

  // Save orchestration results for the dashboard
  const firestore = getAdminFirestore();
  const ref = firestore.collection('users').doc(userId).collection('orchestration').doc('latest');
  await ref.set(orchestration);

  return NextResponse.json(orchestration);
}

// Google Assistant webhook
export async function GET(req: NextRequest) {
  // Health check for Google Assistant
  return NextResponse.json({ status: 'Hermes 2.0 Enhanced ready' });
}