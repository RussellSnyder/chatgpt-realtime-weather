//import modules: express, dotenv
const express = require("express");
const dotenv = require("dotenv");
var cors = require("cors");
const app = express();
const OpenAI = require("openai");
const axios = require("axios");

app.use(cors());
//accept json data in requests
app.use(express.json());

//setup environment variables
dotenv.config();

//build openai instance using OpenAIApi
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

//build the runCompletion which sends a request to the OPENAI Completion API
async function runCompletion(prompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    functions: [
      {
        name: "get_current_weather",
        description: "Get the current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "the city and state, e.g. San Francisco, CA",
            },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
            },
          },
          required: ["location"],
        },
      },
    ],
    temperature: 1,
    max_tokens: 50,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  return response;
}

async function runCompletion2(prompt, function_arguments, weatherObject) {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: null,
        function_call: {
          name: "get_current_weather",
          arguments: function_arguments,
        },
      },
      {
        role: "function",
        name: "get_current_weather",
        content: JSON.stringify(weatherObject),
      },
    ],

    functions: [
      {
        name: "get_current_weather",
        description: "Get the current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "the city and state, e.g. San Francisco, CA",
            },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
            },
          },
          required: ["location"],
        },
      },
    ],
    temperature: 1,
    max_tokens: 50,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  return response;
}

const getWeather = async (parsed_function_arguments) => {
  try {
    const response = await axios.get(
      "http://api.weatherapi.com/v1/current.json",
      {
        params: {
          q: parsed_function_arguments.location,
          key: process.env.WEATHER_API_KEY,
        },
      }
    );
    const weather = response.data;
    const { condition, temp_c, temp_f } = weather.current;
    const unit =
      parsed_function_arguments.unit !== "fahrenheit"
        ? "celsius"
        : "fahrenheit";
    const temperature = unit === "celsius" ? temp_c : temp_f;

    return { temperature, unit, description: condition.text };
  } catch (error) {
    console.error(error);
  }
};

//post request to /api/chatgpt
app.post("/api/chatgpt", async (req, res) => {
  try {
    //extract the text from the request body
    const { text } = req.body;

    // request 1
    // Pass the request text to the runCompletion function
    const completion = await runCompletion(text);

    // get called_function
    const called_function = completion.choices[0].message.function_call;
    console.log({ called_function });

    if (!called_function) {
      res.status(200).json({ data: completion.data });
      return;
    }

    // get functino name and arguments
    const { name: function_name, arguments: function_arguments } =
      called_function;
    const parsed_function_arguments = JSON.parse(function_arguments);

    if (function_name === "get_current_weather") {
      // request 2
      // get the weather

      // temperature, unit and description
      const weatherObject = await getWeather(parsed_function_arguments);

      // request 3
      // make second request to get the weather
      const response = await runCompletion2(
        text,
        function_arguments,
        weatherObject
      );

      console.log({ response });
      res.json(response);
      // res.json({
      //   request1: { data: completion },
      //   request2: weatherObject,
      // });
      return;
    }

    res.status(200).json({ data: completion.data });
  } catch (error) {
    //handle the error in the catch statement
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error("Error with OPENAI API request:", error.message);
      res.status(500).json({
        error: {
          message: "An error occured during your request.",
        },
      });
    }
  }
});

//set the PORT
const PORT = process.env.SERVER_PORT || 5001;

//start the server on the chosen PORT
app.listen(PORT, console.log(`Server started on port ${PORT}`));
