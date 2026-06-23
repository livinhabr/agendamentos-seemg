import { FastifyInstance } from "fastify";
import { env } from "../env";

export default async function widgetRoutes(fastify: FastifyInstance) {
  fastify.get("/widget.js", async (request, reply) => {
    reply.header("Content-Type", "application/javascript");
    
    // Serve a raw vanilla JS file that injects the chat bubble
    return `
(function() {
  const currentScript = document.currentScript;
  const setorSlug = currentScript.getAttribute('data-setor-slug');
  const botSlug = currentScript.getAttribute('data-bot-slug');
  const canalId = currentScript.getAttribute('data-canal-id');
  const title = currentScript.getAttribute('data-title') || 'Atendimento';
  const apiUrl = '${env.PUBLIC_BASE_URL}/api/chat';

  if (!setorSlug || !botSlug || !canalId) {
    console.error('Agenda Widget: Faltam parâmetros data-* no script.');
    return;
  }

  // Create isolated CSS
  const style = document.createElement('style');
  style.textContent = \`
    #agenda-widget-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #agenda-widget-bubble {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #0f172a;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    }
    #agenda-widget-bubble:hover {
      transform: scale(1.05);
    }
    #agenda-widget-chat {
      display: none;
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    #agenda-widget-header {
      background: #0f172a;
      color: white;
      padding: 15px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #agenda-widget-close {
      cursor: pointer;
      background: none;
      border: none;
      color: white;
      font-size: 18px;
    }
    #agenda-widget-messages {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f8fafc;
    }
    .agenda-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
    }
    .agenda-msg-user {
      background: #e2e8f0;
      color: #0f172a;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .agenda-msg-bot {
      background: #3b82f6;
      color: white;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    #agenda-widget-input-area {
      padding: 15px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 10px;
      background: white;
    }
    #agenda-widget-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      outline: none;
    }
    #agenda-widget-send {
      background: #0f172a;
      color: white;
      border: none;
      padding: 0 15px;
      border-radius: 6px;
      cursor: pointer;
    }
  \`;
  document.head.appendChild(style);

  // Generate or get session ID
  let sessionId = localStorage.getItem('agenda_widget_session');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('agenda_widget_session', sessionId);
  }

  // Create DOM elements
  const container = document.createElement('div');
  container.id = 'agenda-widget-container';

  const bubble = document.createElement('div');
  bubble.id = 'agenda-widget-bubble';
  bubble.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

  const chat = document.createElement('div');
  chat.id = 'agenda-widget-chat';

  chat.innerHTML = \`
    <div id="agenda-widget-header">
      <span>\${title}</span>
      <button id="agenda-widget-close">&times;</button>
    </div>
    <div id="agenda-widget-messages"></div>
    <div id="agenda-widget-input-area">
      <input type="text" id="agenda-widget-input" placeholder="Digite sua mensagem..." autocomplete="off" />
      <button id="agenda-widget-send">Enviar</button>
    </div>
  \`;

  container.appendChild(chat);
  container.appendChild(bubble);
  document.body.appendChild(container);

  // Logic
  let isOpen = false;
  const messagesDiv = document.getElementById('agenda-widget-messages');
  const input = document.getElementById('agenda-widget-input');
  const sendBtn = document.getElementById('agenda-widget-send');
  const closeBtn = document.getElementById('agenda-widget-close');

  bubble.onclick = () => {
    isOpen = !isOpen;
    chat.style.display = isOpen ? 'flex' : 'none';
  };

  closeBtn.onclick = () => {
    isOpen = false;
    chat.style.display = 'none';
  };

  function addMessage(text, isUser) {
    const div = document.createElement('div');
    div.className = 'agenda-msg ' + (isUser ? 'agenda-msg-user' : 'agenda-msg-bot');
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, true);
    input.value = '';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setor_slug: setorSlug,
          bot_slug: botSlug,
          canal_id: canalId,
          session_id: sessionId,
          message: text,
          user: {}
        })
      });

      const data = await response.json();
      if (response.ok && data.reply) {
        addMessage(data.reply, false);
      } else {
        addMessage('Erro ao enviar mensagem: ' + (data.error || 'Desconhecido'), false);
      }
    } catch (err) {
      addMessage('Falha na conexão com o servidor.', false);
    }
  }

  sendBtn.onclick = sendMessage;
  input.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

})();
    `;
  });
}
