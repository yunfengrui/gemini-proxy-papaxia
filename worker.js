export default {
  async fetch(request, env, ctx) {
    // 处理 OPTIONS 预检请求 (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const url = new URL(request.url);
    const pathAndQuery = url.pathname + url.search;

    // 1. 处理 WebSocket 请求 (原来的逻辑)
    if (request.headers.get("Upgrade") === "websocket") {
      const targetUrl = `wss://generativelanguage.googleapis.com${pathAndQuery}`;
      console.log('Target WS URL:', targetUrl);

      const [client, proxy] = new WebSocketPair();
      proxy.accept();

      let pendingMessages = [];

      const connectPromise = new Promise((resolve, reject) => {
        const targetWebSocket = new WebSocket(targetUrl);

        targetWebSocket.addEventListener("open", () => {
          for (const message of pendingMessages) {
            try { targetWebSocket.send(message); } catch (error) { console.error(error); }
          }
          pendingMessages = [];
          resolve(targetWebSocket);
        });

        proxy.addEventListener("message", async (event) => {
          if (targetWebSocket.readyState === WebSocket.OPEN) {
            targetWebSocket.send(event.data);
          } else {
            pendingMessages.push(event.data);
          }
        });

        targetWebSocket.addEventListener("message", (event) => {
          if (proxy.readyState === WebSocket.OPEN) {
            proxy.send(event.data);
          }
        });

        targetWebSocket.addEventListener("close", (event) => {
          if (proxy.readyState === WebSocket.OPEN) proxy.close(event.code, event.reason);
        });

        proxy.addEventListener("close", (event) => {
          if (targetWebSocket.readyState === WebSocket.OPEN) targetWebSocket.close(event.code, event.reason);
        });
      });

      ctx.waitUntil(connectPromise);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    } 
    // 2. 处理普通的 HTTP 请求 (如 generateContent)
    else {
      const targetUrl = `https://generativelanguage.googleapis.com${pathAndQuery}`;
      console.log('Target HTTP URL:', targetUrl);

      // 构建发往 Gemini 的请求
      const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "follow",
      });

      // 删除可能导致目标服务器拒绝的 header
      newRequest.headers.delete("host");

      try {
        const response = await fetch(newRequest);
        
        // 构造带有 CORS 的响应
        const newResponse = new Response(response.body, response);
        newResponse.headers.set("Access-Control-Allow-Origin", "*");
        
        return newResponse;
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }
  },
};