const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const fs = require('fs');
const path = require('path');

// Initialize Google Generative AI
const apiKey ='AIzaSyAYinKiYLPNeCT5pqRQkpp5UDP_cO9pmYc'; // Use environment variables
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
  // **CORS Handling Start**

  // Allowed origins (update this with your frontend's actual origin in production)
  const allowedOrigins = ['http://localhost:5173']; // Add your production frontend URL here

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Optionally, reject requests from disallowed origins
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight response for 1 day

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // **CORS Handling End**

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

    if (file) {
      const mimeType = file.mimetype;
      const tempPath = path.join('/tmp', file.originalname);
      fs.writeFileSync(tempPath, file.buffer);
      
      // Try to upload the file
      uploadedFile = await fileManager.uploadFile(tempPath, {
        mimeType,
        displayName: file.originalname,
      });
      
      // Log the file URI to check if it's valid
      console.log("Uploaded File URI: ", uploadedFile.uri);
      
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
