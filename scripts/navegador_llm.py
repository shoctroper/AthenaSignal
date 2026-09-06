#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import time
from playwright.sync_api import sync_playwright

def consultar_llm_web(prompt, url="https://chat.deepseek.com", debug=False):
    """
    Usa Playwright para consultar un LLM a través de su interfaz web.
    Intenta conectarse a un Chrome ya abierto con --remote-debugging-port=9222.
    Si falla, crea un contexto persistente.
    """
    with sync_playwright() as p:
        browser = None
        try:
            # 1. Intentar conectar al navegador principal (Evita logins repetitivos y bloqueos anti-bot)
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
            context = browser.contexts[0]
            page = context.new_page()
            print("[Navegador] Conectado a Chrome local (CDP).", file=sys.stderr)
        except Exception as e:
            # 2. Fallback: Lanzar un navegador persistente en modo Headless
            print("[Navegador] Falló CDP, usando contexto persistente local.", file=sys.stderr)
            user_data_dir = "./perfil_navegador_llm"
            browser = p.chromium.launch_persistent_context(
                user_data_dir,
                headless=not debug,
                viewport={"width": 1280, "height": 800}
            )
            page = browser.new_page()

        page.goto(url)
        
        # 1. Encontrar la caja de chat (adaptado para DeepSeek Web UI)
        caja_chat = page.locator("textarea, [contenteditable='true']").first
        caja_chat.wait_for(state="visible", timeout=20000)
        
        # 2. Inyectar prompt
        caja_chat.fill(prompt)
        page.keyboard.press("Enter")
        print("[Navegador] Prompt enviado.", file=sys.stderr)
        
        # 3. Polling para esperar a que termine de generar (DeepSeek UI)
        try:
            # Monitorea que la redacción inicie y luego se estabilice el DOM
            time.sleep(3)
            # Espera a que el botón de "Stop Generating" o similar desaparezca, 
            # o simplemente esperamos a que el texto deje de crecer (Polling básico)
            ultimo_texto = ""
            estabilizado = 0
            for _ in range(60): # Max 2 minutos (60 * 2s)
                time.sleep(2)
                respuestas = page.locator(".markdown-body, .prose, .ds-markdown").all_text_contents()
                if respuestas:
                    texto_actual = respuestas[-1]
                    if texto_actual == ultimo_texto and len(texto_actual) > 10:
                        estabilizado += 1
                        if estabilizado >= 3: # Si el texto no cambió por 6 segundos, asumimos que terminó
                            break
                    else:
                        estabilizado = 0
                        ultimo_texto = texto_actual
        except Exception as e:
            print(f"[Error] Esperando respuesta: {e}", file=sys.stderr)
        
        # 4. Extraer respuesta
        respuestas = page.locator(".markdown-body, .prose, .ds-markdown").all_text_contents()
        resultado = "ERROR: Sin respuesta extraída."
        if respuestas:
            resultado = respuestas[-1]
            
        page.close()
        if not hasattr(browser, 'contexts'): # Solo cerramos si no es CDP
            browser.close()
            
        return resultado

if __name__ == "__main__":
    # Leemos el prompt desde STDIN (pipeline de bash/n8n)
    prompt = sys.stdin.read().strip()
    
    if not prompt:
        print("Error: El prompt está vacío. Envía texto por STDIN.", file=sys.stderr)
        sys.exit(1)
        
    respuesta = consultar_llm_web(prompt, url="https://chat.deepseek.com", debug=False)
    
    # Imprimimos la respuesta en STDOUT para que n8n o bash la capture
    print(respuesta)
