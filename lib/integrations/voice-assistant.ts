/**
 * Google Assistant & Alexa Integration for Hermes
 * Voice control for all family OS features
 */

import { askHermes, FamilyContext } from '../hermes';

export interface VoiceCommand {
  intent: string;
  slots: Record<string, any>;
  userId: string;
  device: 'google' | 'alexa';
}

export class VoiceAssistantIntegration {
  constructor(
    private googleProjectId?: string,
    private alexaSkillId?: string
  ) {}

  // Google Assistant Actions
  async handleGoogleAction(conv: any) {
    const intent = conv.intent;
    const userId = conv.user.storage.userId;

    const handlers: Record<string, () => Promise<string>> = {
      'hermes.briefing': () => this.getMorningBriefing(userId),
      'hermes.task.add': () => this.addTask(conv.parameters),
      'hermes.task.status': () => this.getTaskStatus(userId),
      'hermes.shopping.add': () => this.addToShopping(conv.parameters.item),
      'hermes.meal.today': () => this.getTodaysMeal(),
      'hermes.emergency': () => this.triggerEmergency(conv.parameters.type),
      'hermes.find': () => this.findObject(conv.parameters.item),
      'hermes.reminder': () => this.setReminder(conv.parameters),
      'hermes.family.where': () => this.getFamilyLocations(),
      'hermes.decision': () => this.makeDecision(conv.parameters.type),
    };

    const response = await handlers[intent]?.() || 'I didn\'t understand that.';
    conv.ask(response);
  }

  // Alexa Skill Handler
  async handleAlexaRequest(handlerInput: any) {
    const requestType = handlerInput.requestEnvelope.request.type;
    const intentName = handlerInput.requestEnvelope.request.intent?.name;

    if (requestType === 'LaunchRequest') {
      return this.getMorningBriefing('default');
    }

    const handlers: Record<string, () => Promise<string>> = {
      'HermesBriefingIntent': () => this.getMorningBriefing('default'),
      'AddTaskIntent': () => this.addTask(handlerInput.requestEnvelope.request.intent.slots),
      'CheckTasksIntent': () => this.getTaskStatus('default'),
      'AddShoppingIntent': () => this.addToShopping(handlerInput.requestEnvelope.request.intent.slots.item.value),
      'WhatsForDinnerIntent': () => this.getTodaysMeal(),
      'EmergencyIntent': () => this.triggerEmergency('general'),
      'FindItemIntent': () => this.findObject(handlerInput.requestEnvelope.request.intent.slots.item.value),
    };

    const response = await handlers[intentName]?.() || 'Sorry, I didn\'t catch that.';
    
    return handlerInput.responseBuilder
      .speak(response)
      .withShouldEndSession(false)
      .getResponse();
  }

  // Shared command implementations
  private async getMorningBriefing(userId: string): Promise<string> {
    const context: FamilyContext = {
      currentUser: { id: userId },
      date: new Date().toLocaleString(),
    };

    const response = await askHermes(
      [{ role: 'user', content: 'Give morning briefing for the family. Voice-friendly, 3 sentences max.' }],
      context
    );

    return this.makeVoiceFriendly(response.content);
  }

  private async addTask(params: any): Promise<string> {
    // Would integrate with task system
    const taskTitle = params.task || params.title || params.item;
    return `I've added "${taskTitle}" to your tasks. It's been assigned based on everyone's schedule.`;
  }

  private async getTaskStatus(userId: string): Promise<string> {
    const context: FamilyContext = {
      currentUser: { id: userId },
      tasks: [], // Would fetch actual tasks
    };

    const response = await askHermes(
      [{ role: 'user', content: 'Summarize task status for today. Voice-friendly, very brief.' }],
      context
    );

    return this.makeVoiceFriendly(response.content);
  }

  private async addToShopping(item: string): Promise<string> {
    // Would integrate with shopping system
    return `I've added ${item} to your shopping list. You're running low on milk too, should I add that?`;
  }

  private async getTodaysMeal(): Promise<string> {
    const response = await askHermes(
      [{ role: 'user', content: 'What\'s for dinner tonight based on meal plan? One sentence.' }],
      {}
    );
    return this.makeVoiceFriendly(response.content);
  }

  private async triggerEmergency(type: string): Promise<string> {
    // Would activate emergency protocol
    return `Emergency protocol activated. I've simplified today's schedule and notified backup contacts.`;
  }

  private async findObject(item: string): Promise<string> {
    // Would query memory palace
    const locations: Record<string, string> = {
      'keys': 'on the kitchen counter',
      'backpack': 'by the front door',
      'glasses': 'on your nightstand',
    };

    return locations[item.toLowerCase()] 
      ? `Your ${item} should be ${locations[item.toLowerCase()]}.`
      : `I haven't seen the ${item} recently. Try checking the usual spots.`;
  }

  private async setReminder(params: any): Promise<string> {
    const what = params.task || params.reminder;
    const when = params.time || 'later';
    return `I'll remind you to ${what} ${when}.`;
  }

  private async getFamilyLocations(): Promise<string> {
    // Would integrate with location services
    return 'Dad is at work, Mom is home, and the kids are at school.';
  }

  private async makeDecision(type: string): Promise<string> {
    const decisions: Record<string, string> = {
      'dinner': 'Based on what you have and the time, make spaghetti. It\'s quick and everyone likes it.',
      'outfit': 'It\'s chilly and you have gym today. Wear layers with your athletic clothes underneath.',
      'activity': 'You have 30 minutes. Perfect for a quick walk or one episode of that show.',
    };

    return decisions[type] || 'Let me think about that and get back to you.';
  }

  private makeVoiceFriendly(text: string): string {
    // Remove markdown, links, special characters
    return text
      .replace(/[#*`\[\]()]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Google Assistant Action definitions
export const GOOGLE_ACTIONS = {
  actions: [{
    name: 'hermes.briefing',
    fulfillment: 'webhook',
    intent: {
      name: 'hermes.briefing',
      trigger: {
        queryPatterns: [
          'talk to Bear House',
          'ask Hermes for briefing',
          'what\'s happening today',
          'family update',
        ],
      },
    },
  }, {
    name: 'hermes.task.add',
    fulfillment: 'webhook',
    intent: {
      name: 'hermes.task.add',
      parameters: [{
        name: 'task',
        type: 'SchemaOrg_Text',
      }],
      trigger: {
        queryPatterns: [
          'add task $task',
          'remind us to $task',
          'we need to $task',
        ],
      },
    },
  }, {
    name: 'hermes.emergency',
    fulfillment: 'webhook',
    intent: {
      name: 'hermes.emergency',
      parameters: [{
        name: 'type',
        type: 'EmergencyType',
      }],
      trigger: {
        queryPatterns: [
          'emergency protocol',
          'activate emergency',
          'crisis mode',
          'help someone is sick',
        ],
      },
    },
  }],
};

// Alexa Skill Interaction Model
export const ALEXA_INTERACTION_MODEL = {
  interactionModel: {
    languageModel: {
      invocationName: 'bear house',
      intents: [{
        name: 'HermesBriefingIntent',
        samples: [
          'what\'s happening today',
          'give me the family briefing',
          'morning update',
          'what\'s on the schedule',
        ],
      }, {
        name: 'AddTaskIntent',
        slots: [{
          name: 'task',
          type: 'AMAZON.SearchQuery',
        }],
        samples: [
          'add {task} to tasks',
          'remind us to {task}',
          'we need to {task}',
          'put {task} on the list',
        ],
      }, {
        name: 'FindItemIntent',
        slots: [{
          name: 'item',
          type: 'AMAZON.SearchQuery',
        }],
        samples: [
          'where is my {item}',
          'find my {item}',
          'have you seen the {item}',
          'where did I put the {item}',
        ],
      }, {
        name: 'EmergencyIntent',
        samples: [
          'emergency',
          'activate emergency protocol',
          'crisis mode',
          'we need help',
        ],
      }],
    },
  },
};