import { useChatContext } from "@/context/ChatContext";
import { IChat, IMessage, IThreadChat } from "@/interfaces/chat";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";

const DB_NAME = import.meta.env.VITE_DB_NAME || "chatDB";
const DB_VERSION = Number(import.meta.env.VITE_DB_VERSION) || 1;
const STORE_NAME_CHATS = import.meta.env.VITE_STORE_NAME_CHATS || "chats";
const STORE_NAME_THREADS = import.meta.env.VITE_STORE_NAME_THREADS || "threads";

const ChatInput = () => {
  const { chatUuid, setChatUuid, messages, setMessages, setChats } =
    useChatContext();
  const [textInput, setTextInput] = useState("");

  const handleSubmit = async () => {
    let auxChatUuid = chatUuid;

    if (!auxChatUuid) {
      auxChatUuid = uuidv4();
      await createChat(auxChatUuid);
    }

    const userMessage: IMessage = {
      role: "user",
      content: textInput,
    };

    setTextInput("");
    const auxThread = [...messages];
    auxThread.push(userMessage);
    setMessages(auxThread);

    try {
      await saveMessage(userMessage, auxChatUuid);
      await handleSendMessage(auxThread, auxChatUuid);
    } catch (error) {
      console.error("Error al guardar el mensaje:", error);
    }
  };

  // 💥HOOK
  const getChats = async () => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction([STORE_NAME_CHATS], "readonly");
      const store = transaction.objectStore(STORE_NAME_CHATS);
      const request = store.getAll();

      request.onsuccess = () => {
        setChats(request.result);
      };
    };
  };

  const createChat = async (id: string): Promise<void> => {
    setChatUuid(id);

    const chat: IChat = {
      id: id,
      created_at: new Date(),
      topic: id,
    };

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction([STORE_NAME_CHATS], "readwrite");
        const store = transaction.objectStore(STORE_NAME_CHATS);
        const addRequest = store.add(chat);

        addRequest.onsuccess = () => {
          console.log("Chat iniciado", id);
          resolve();
          getChats();
        };

        addRequest.onerror = () => {
          setChatUuid("");
          reject(new Error("Error al crear el chat"));
        };
      };
    });
  };

  const handleSendMessage = async (auxHistory: IMessage[], uuid: string) => {
    const response = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: textInput, uuid }),
    });

    const reader = response?.body?.getReader();
    const decoder = new TextDecoder("utf-8");

    const index = auxHistory.length;
    let fullResponse = "";

    while (true) {
      if (!reader) {
        console.log("No reader");
        break;
      }

      const { done, value } = await reader.read();

      if (done) {
        const assistantMessage: IMessage = {
          role: "assistant",
          content: fullResponse,
        };
        const auxFullResponseHistory = [...auxHistory];
        auxFullResponseHistory[index] = assistantMessage;
        setMessages(auxFullResponseHistory);

        try {
          await saveMessage(assistantMessage, uuid);
        } catch (error) {
          console.error("Error al guardar la respuesta:", error);
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const jsonResponse = JSON.parse(chunk.replace("data: ", ""));

      fullResponse += jsonResponse.response;
      const auxFullResponseHistory = [...auxHistory];
      const assistantMessage: IMessage = {
        role: "assistant",
        content: fullResponse,
      };
      auxFullResponseHistory[index] = assistantMessage;
      setMessages(auxFullResponseHistory);
    }
  };

  const saveMessage = async (
    message: IMessage,
    uuid: string
  ): Promise<void> => {
    const thread: IThreadChat = {
      id: uuidv4(),
      chatUuid: uuid,
      created_at: new Date(),
      message,
    };

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Error al abrir la base de datos"));
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction([STORE_NAME_THREADS], "readwrite");
        const store = transaction.objectStore(STORE_NAME_THREADS);
        const addRequest = store.add(thread);

        addRequest.onsuccess = () => {
          resolve();
        };

        addRequest.onerror = () => {
          reject(new Error("Error al guardar el mensaje"));
        };
      };
    });
  };

  return (
    <div className="[grid-area:chat] flex flex-col md:flex-row gap-2">
      <input
        type="text"
        placeholder="Type a message..."
        className="w-full border-2 border-gray-300 rounded-md p-2 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-0 focus:border-blue-500 focus:ring-blue-500"
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSubmit();
          }
        }}
      />
      <button
        type="submit"
        className="bg-blue-500 text-white p-2 rounded-md"
        onClick={handleSubmit}
      >
        Send
      </button>
    </div>
  );
};

export default ChatInput;
