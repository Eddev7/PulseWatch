import os
import time
import psutil
import subprocess
import requests
from datetime import datetime
import threading
import json
import tkinter as tk
from tkinter import simpledialog, messagebox
from dotenv import load_dotenv
load_dotenv()

PROCESS_NAME = # Nome do processo a ser monitorado
DEFAULT_EXECUTABLE_PATH = # Caminho padrão do executável
RESTART_INTERVAL = 10800  # 3 horas
HEARTBEAT_INTERVAL = 120  # 2 minutos
API_URL = # URL da API para enviar o heartbeat
CONFIG_FILE = "config.json" # Caminho do arquivo de configuração

def log(message):
    with open("log.txt", "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    else:
        root = tk.Tk()
        root.withdraw()
        loja_id = simpledialog.askstring("Configuração Inicial", "Digite o nome da loja:")
        if not loja_id:
            messagebox.showerror("Erro", "Nome da loja obrigatório. Encerrando.")
            exit(1)
        config = {"loja_id": loja_id}
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f)
        return config

def find_executable():
    if os.path.exists(DEFAULT_EXECUTABLE_PATH):
        return DEFAULT_EXECUTABLE_PATH
    for root, dirs, files in os.walk("C:\\"):
        if PROCESS_NAME in files:
            return os.path.join(root, PROCESS_NAME)
    log("❌ Não foi possível encontrar o executável automaticamente.")
    return None

def kill_process(name):
    for proc in psutil.process_iter(attrs=['pid', 'name']):
        if proc.info['name'].lower() == name.lower():
            try:
                log(f"Matando processo {name} (PID: {proc.info['pid']})")
                proc.kill()
                log(f"Processo {name} encerrado com sucesso.")
                return
            except psutil.NoSuchProcess:
                log(f"Processo {name} não existe mais.")
    log(f"Processo {name} não foi encontrado.")

def restart_process(executable_path):
    kill_process(PROCESS_NAME)
    log(f"Iniciando {PROCESS_NAME} novamente...")
    if not executable_path or not os.path.exists(executable_path):
        log("❌ Caminho do executável inválido.")
        return
    try:
        subprocess.Popen([executable_path], shell=True)
        log("✅ Processo iniciado com sucesso.")
    except Exception as e:
        log(f"Erro ao iniciar o processo: {e}")

def send_heartbeat(loja_id):
    while True:
        try:
            response = requests.post(API_URL, json={"loja_id": loja_id}, timeout=10)
            if response.status_code == 200:
                log("✅ Heartbeat enviado com sucesso.")
            else:
                log(f"⚠️ Falha no heartbeat: {response.status_code} - {response.text}")
        except Exception as e:
            log(f"❌ Erro ao enviar heartbeat: {e}")
        time.sleep(HEARTBEAT_INTERVAL)

if __name__ == "__main__":
    config = load_config()
    LOJA_ID = config["loja_id"]
    EXECUTABLE_PATH = find_executable()

    if not EXECUTABLE_PATH:
        tk.Tk().withdraw()
        messagebox.showerror("Erro", "Executável ServUni2.exe não encontrado.")
        exit(1)

    # Mostra uma caixinha indicando que está rodando
    root = tk.Tk()
    root.withdraw()
    messagebox.showinfo("Monitoramento", "Rodando em segundo plano.\nPode minimizar ou fechar essa janela.")

    # Inicia heartbeat e processo
    threading.Thread(target=send_heartbeat, args=(LOJA_ID,), daemon=True).start()

    while True:
        restart_process(EXECUTABLE_PATH)
        time.sleep(RESTART_INTERVAL)
