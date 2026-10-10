import OpenAI from 'openai';
import { z } from 'zod';

const classificationSchema = z.object({
  category: z.enum(['medical', 'personal_safety', 'accident', 'fire', 'natural_disaster', 'other']),
  urgency: z.enum(['critical', 'high', 'moderate', 'unknown']),
  summary: z.string().min(5).max(400),
  recommendedActions: z.array(z.string()).max(3),
  missingInformation: z.array(z.string()),
  requiresHumanConfirmation: z.boolean(),
});

const copilotSchema = z.object({
  answer: z.string().min(5).max(300),
});

function fallbackClassification(description) {
  const text = description.toLowerCase();

  let category = 'other';
  if (text.includes('collapse') || text.includes('unresponsive') || text.includes('chest pain') || text.includes('breathing')) {
    category = 'medical';
  } else if (text.includes('stalking') || text.includes('unsafe') || text.includes('harassment') || text.includes('threat')) {
    category = 'personal_safety';
  } else if (text.includes('fire') || text.includes('smoke')) {
    category = 'fire';
  } else if (text.includes('accident') || text.includes('crash') || text.includes('injured')) {
    category = 'accident';
  } else if (text.includes('flood') || text.includes('storm') || text.includes('earthquake')) {
    category = 'natural_disaster';
  }

  return {
    category,
    urgency: category === 'medical' ? 'critical' : 'high',
    summary: 'Emergency context captured. Prioritize immediate safety and contact the nearest relevant service if the situation is time-sensitive.',
    recommendedActions: ['Move to a safe area if possible', 'Contact emergency services if immediate help is needed', 'Share your location with a trusted contact'],
    missingInformation: text.length < 20 ? ['Urgency details and exact location'] : [],
    requiresHumanConfirmation: true,
  };
}

export async function classifyIncident(description, context = {}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const classified = fallbackClassification(description);
    return classificationSchema.parse(classified);
  }

  try {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: false });
    const completion = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: `You are helping classify an emergency description. Return JSON only with category, urgency, summary, recommendedActions, missingInformation, requiresHumanConfirmation. Do not claim medical diagnosis. Context: ${JSON.stringify(context)}. Description: ${description}`,
      temperature: 0.2,
      max_output_tokens: 300,
    });

    const raw = completion.output_text || '{}';
    const parsed = JSON.parse(raw);
    return classificationSchema.parse(parsed);
  } catch (error) {
    return classificationSchema.parse(fallbackClassification(description));
  }
}

export async function generateBrief(incident) {
  const text = `Incident category: ${incident.category}. Description: ${incident.description}. Location: ${incident.location?.latitude}, ${incident.location?.longitude}.`;
  return {
    incidentCategory: incident.category,
    userReportedDescription: incident.description,
    timestamp: incident.createdAt,
    location: incident.location,
    recommendedNextAction: 'Reach a safe area and notify a trusted contact while emergency services are contacted if needed.',
    dataUnknown: ['Exact onset time', 'Number of people involved'],
    summary: text,
  };
}

export async function chatWithCopilot(message, context = {}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const answer = `I can help with immediate guidance. Based on what you have shared, stay calm, move to a safe area if possible, contact emergency services, and share your location with a trusted contact.`;
    return copilotSchema.parse({ answer });
  }

  try {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: false });
    const completion = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: `You are a calm emergency assistant. Keep responses short, actionable, and factual. Use this context: ${JSON.stringify(context)}. User message: ${message}`,
      temperature: 0.3,
      max_output_tokens: 220,
    });

    const raw = completion.output_text || 'Please contact emergency services if this is time-sensitive.';
    return copilotSchema.parse({ answer: raw });
  } catch (error) {
    return copilotSchema.parse({
      answer: 'If this is a life-threatening emergency, contact local emergency services immediately while moving to a safe place if possible.',
    });
  }
}
