const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const FormData = require('form-data');
const fs = require('fs');

// Initialize Google Generative AI
const apiKey = process.env.GOOGLE_API_KEY; // Use environment variables
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

const availableModels = {
  "gemini-1.5-flash": genAI.getGenerativeModel({ model: "gemini-1.5-flash" }),
  "packagetestv2-nettsfkvxpqs": genAI.getGenerativeModel({ model: "tunedModels/packagetestv2-nettsfkvxpqs" }),
};

// Multer setup for parsing multipart/form-data
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper function to parse multipart/form-data
const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    upload.single('image')(req, {}, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await parseForm(req);

    const { question, model } = req.body;
    const file = req.file;

    if (!question) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    if (!model || !availableModels[model]) {
      return res.status(400).json({ error: 'Invalid model selected.' });
    }

    const selectedModel = availableModels[model];
    const generationConfig = {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 512,
      responseMimeType: "text/plain",
    };

    let uploadedFile = null;

    // If a file is provided, upload it to Gemini
    if (file) {
      const mimeType = file.mimetype;
      // Save buffer to a temporary file
      const tempPath = `/tmp/${file.originalname}`;
      fs.writeFileSync(tempPath, file.buffer);
      uploadedFile = await fileManager.uploadFile(tempPath, {
        mimeType,
        displayName: file.originalname,
      });
      // Optionally delete the temp file
      fs.unlinkSync(tempPath);
    }

    const history = [
      {
        role: "user",
        parts: [
          { text: question },
        ],
      }
    ];

    // If the file was uploaded, include it in the chat history
    if (uploadedFile) {
      history.push({
        role: "user",
        parts: [
          {
            fileData: {
              mimeType: uploadedFile.mimeType,
              fileUri: uploadedFile.uri,
            },
          }
        ]
      });
    }

    const chatSession = selectedModel.startChat({
      generationConfig,
      history,
    });

    const result = await chatSession.sendMessage(question);
    console.log(result.response.text());
    res.status(200).json({ answer: result.response.text().trim() });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error processing AI response' });
  }
};
