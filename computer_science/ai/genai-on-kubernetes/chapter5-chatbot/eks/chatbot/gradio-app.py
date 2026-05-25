import logging
import os
import sys

import gradio as gr
import requests

RAG_API_ENDPOINT = os.getenv("RAG_API_ENDPOINT", "http://localhost:5000/generate")
FINETUNE_API_ENDPOINT = os.getenv("FINETUNE_API_ENDPOINT", "http://localhost:5000/generate")

logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler(sys.stdout)])
logger = logging.getLogger(__name__)


def chat_with_model(user_input, model_choice, history=None, session_id=None):
  """Send a user prompt to the selected backend and update Gradio chat history."""
  history = history or []
  headers = {"Content-Type": "application/json"}
  data = {"prompt": user_input}

  if session_id:
    data["session_id"] = session_id

  if model_choice == "Shopping":
    api_endpoint = RAG_API_ENDPOINT
  elif model_choice == "Loyalty Program":
    api_endpoint = FINETUNE_API_ENDPOINT
  else:
    history.append({"role": "assistant", "content": "Error: Invalid model choice."})
    return history, "", session_id

  try:
    response = requests.post(api_endpoint, headers=headers, json=data, timeout=60)
    response.raise_for_status()
    response_data = response.json()
    logger.info("API response: %s", response_data)

    model_response = response_data.get("response", "No response from model.")
    session_id = response_data.get("session_id", session_id)

    history.append({"role": "user", "content": user_input})
    history.append({"role": "assistant", "content": model_response})
    return history, "", session_id

  except requests.exceptions.RequestException as error:
    logger.exception("Error occurred")
    history.append({"role": "user", "content": user_input})
    history.append({"role": "assistant", "content": f"Error: {error}"})
    return history, "", session_id


def clear_chat():
  """Clear Gradio chat state."""
  return [], "", None


with gr.Blocks() as demo:
  gr.Markdown("# MyRetail ecommerce assistant")
  chatbot = gr.Chatbot(type="messages")
  model_choice = gr.Radio(
    choices=["Shopping", "Loyalty Program"],
    value="Shopping",
    label="Choose an assistant",
  )
  user_input = gr.Textbox(show_label=False, label="Type your question")
  session_id = gr.State()

  with gr.Row():
    submit_button = gr.Button("Submit")
    clear_button = gr.Button("Clear")

  submit_button.click(
    chat_with_model,
    inputs=[user_input, model_choice, chatbot, session_id],
    outputs=[chatbot, user_input, session_id],
  )
  user_input.submit(
    chat_with_model,
    inputs=[user_input, model_choice, chatbot, session_id],
    outputs=[chatbot, user_input, session_id],
  )
  clear_button.click(clear_chat, None, [chatbot, user_input, session_id])


demo.launch(server_name="0.0.0.0", server_port=7860)
