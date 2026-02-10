
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, ExpenseCategory } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const transactionSchema = {
  type: Type.OBJECT,
  properties: {
    amount: {
      type: Type.NUMBER,
      description: "The numeric amount of the transaction.",
    },
    merchant: {
      type: Type.STRING,
      description: "The name of the store, restaurant, or service.",
    },
    date: {
      type: Type.STRING,
      description: "The date of the transaction in YYYY-MM-DD format.",
    },
    category: {
      type: Type.STRING,
      description: "The category of the expense (Food & Dining, Shopping, Transport, Utilities & Bills, Entertainment, Health, Travel, Other, Income).",
    },
    type: {
      type: Type.STRING,
      description: "Either DEBIT or CREDIT.",
    },
    description: {
      type: Type.STRING,
      description: "A short summary of what was purchased.",
    }
  },
  required: ["amount", "merchant", "date", "category", "type", "description"]
};

export const parseEmailContent = async (emailText: string): Promise<Transaction | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract transaction details from this HDFC Bank InstaAlert email text. If it's a credit (like a refund or salary), mark it as type CREDIT and category Income. If it's a debit, mark it as type DEBIT and choose the best category.
      
      Email Content:
      "${emailText}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: transactionSchema
      },
    });

    const jsonStr = response.text?.trim();
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);
    return {
      ...parsed,
      id: Math.random().toString(36).substr(2, 9),
    };
  } catch (error) {
    console.error("Error parsing email with Gemini:", error);
    return null;
  }
};
