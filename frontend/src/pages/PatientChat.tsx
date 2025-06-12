import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../styles/Chat.css';
import { getUserData, updateUserProfile, createChatSession, getChatSessionsForUser, getChatSessionById, updateChatSessionMessages, deleteChatSession } from '../firebase/services';
import { auth } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, Firestore, getFirestore } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Add a file icon component
import { FaFile, FaFileUpload, FaPaperclip, FaTimes, FaSpinner, FaPaperPlane } from 'react-icons/fa';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  fileId?: string;
  fileName?: string;
  fileType?: string;
}

interface ChatSession {
  id: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
  messages: Message[];
}

// Interface for uploaded file info
interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
}

const PatientChat: React.FC = () => {
  const { logout, userId, userData } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [patientInfo, setPatientInfo] = useState({
    name: '',
    email: ''
  });
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [newName, setNewName] = useState('');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUploadedFile, setCurrentUploadedFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!userId) {
        console.error("No userId available for fetching patient data");
        return;
      }
      
      try {
        setLoading(true);
        
        console.log("Current userId:", userId);
        console.log("Current userData from context:", userData);
        console.log("Current auth:", auth);
        console.log("Current user from auth:", auth.currentUser);
        
        // Get additional patient data if needed
        console.log("Fetching user data from Firebase for userId:", userId);
        const patientData = await getUserData(userId);
        
        // Prepare patient info before setting state
        let name = '';
        let email = '';
        
        if (patientData) {
          console.log("Patient data from Firestore:", patientData);
          console.log("name from patientData:", patientData.name);
          console.log("email from patientData:", patientData.email);
          
          name = patientData.name || userData?.name || '';
          email = patientData.email || userData?.email || '';
        } else {
          // Use data from auth context if no separate document exists
          console.log("No data from Firestore. Using auth context data:", userData);
          name = userData?.name || '';
          email = userData?.email || '';
        }
        
        // Last resort: check Firebase Auth directly
        if (!name && auth.currentUser?.displayName) {
          console.log("Using displayName from Firebase Auth currentUser:", auth.currentUser.displayName);
          name = auth.currentUser.displayName;
        }
        
        if (!email && auth.currentUser?.email) {
          console.log("Using email from Firebase Auth currentUser:", auth.currentUser.email);
          email = auth.currentUser.email;
        }
        
        if (!name && !email) {
          console.error("Failed to get name and email from all sources");
        }
        
        console.log("Setting patientInfo to:", { name, email });
        
        // Set state with the prepared values
        setPatientInfo({
          name,
          email
        });
        
        // Initialize WebSocket connection after getting user data
        initializeWebSocket();
        
      } catch (error) {
        console.error("Error fetching patient data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPatientData();

    // Cleanup WebSocket connection on component unmount
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [userId, userData]);

  const initializeWebSocket = (customSessionId?: string) => {
    if (!userId) {
      console.error("Cannot initialize WebSocket: userId is undefined");
      return;
    }

    try {
      // Use customSessionId if provided, otherwise use existing logic
      const wsSessionId = customSessionId || activeSessionId || sessionId || `session_${Math.random().toString(36).substr(2, 9)}`;
      
      // Update sessionId state if it's different
      if (sessionId !== wsSessionId) {
        console.log(`Updating sessionId from ${sessionId || 'undefined'} to ${wsSessionId}`);
        setSessionId(wsSessionId);
      }

      // Create WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
      const wsUrl = `${protocol}//${host}/ws/${userId}/${wsSessionId}`;
      
      console.log('Connecting to WebSocket at:', wsUrl);
      console.log('Using session ID:', wsSessionId);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connection established successfully');
      };

      ws.onmessage = (event) => {
        try {
          console.log('Received WebSocket message:', event.data);
          const data = JSON.parse(event.data);
          if (data.type === 'agent_response') {
            const agentMessage: Message = {
              id: Date.now().toString(),
              text: data.text,
              sender: 'agent',
              timestamp: new Date(),
              fileId: data.fileId,
              fileName: data.fileName,
              fileType: data.fileType
            };
            
            // Update messages state with the agent response from WebSocket
            setMessages(prevMessages => {
              const updatedMessages = [...prevMessages, agentMessage];
              
              // Save to Firestore with the current active session ID
              const currentSessionId = activeSessionId || wsSessionId;
              if (currentSessionId) {
                console.log("Saving WebSocket agent response to Firestore, session ID:", currentSessionId);
                updateChatSessionMessages(
                  currentSessionId,
                  updatedMessages
                ).catch(error => {
                  console.error("Error saving WebSocket response to Firestore:", error);
                });
              } else {
                console.error("Cannot save WebSocket response: No active session ID available");
              }
              
              return updatedMessages;
            });
            
            setIsSending(false);
            setIsAgentThinking(false);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          setIsAgentThinking(false);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed', event);
        setIsAgentThinking(false);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsAgentThinking(false);
      };

      setSocket(ws);
    } catch (error) {
      console.error('Error initializing WebSocket:', error);
      setIsAgentThinking(false);
    }
  };

  useEffect(() => {
    console.log("PatientInfo updated:", patientInfo);
    
    // Show the name prompt if name is missing but we have an email
    if (!patientInfo.name && patientInfo.email && !showNamePrompt) {
      setShowNamePrompt(true);
    }
  }, [patientInfo]);

  // Function to handle name update
  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    try {
      const success = await updateUserProfile(newName);
      if (success) {
        setPatientInfo(prev => ({
          ...prev,
          name: newName
        }));
        setShowNamePrompt(false);
      }
    } catch (error) {
      console.error("Error updating name:", error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAgentThinking]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !currentUploadedFile) || isSending) return;
    
    try {
      setIsSending(true);
      setIsAgentThinking(true);
      
      // Create a new user message object
      const userMessage: Message = {
        id: Date.now().toString(),
        text: message,
        sender: 'user',
        timestamp: new Date(),
        fileId: currentUploadedFile?.fileId,
        fileName: currentUploadedFile?.fileName,
        fileType: currentUploadedFile?.mimeType
      };
      
      // Update messages state with the new message
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      
      // Scroll to bottom to show new message
      scrollToBottom();
      
      // Reset upload state after adding to message
      const fileBeingSent = currentUploadedFile;
      setCurrentUploadedFile(null);
      setSelectedFile(null);
      
      // Skip API call if there's an active socket connection
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Sending message via WebSocket with fileId:", fileBeingSent?.fileId);
        
        // Create message payload with fileId if available
        const messagePayload = {
          type: 'user_message',
          text: message,
          fileId: fileBeingSent?.fileId
        };
        
        // Log the entire payload for debugging
        console.log("Full WebSocket payload with fileId:", JSON.stringify(messagePayload, null, 2));
        
        // Send the message through WebSocket
        socket.send(JSON.stringify(messagePayload));
        
        // Save to Firestore
        const sessionToUse = activeSessionId || sessionId;
        if (sessionToUse) {
          try {
            await updateChatSessionMessages(
              sessionToUse,
              updatedMessages
            );
          } catch (error) {
            console.error("Error saving message to Firestore:", error);
          }
        }
        
        // Reset message input
        setMessage('');
        return;
      }
      
      // If no socket or socket is closed, use REST API
      const response = await callApiWithRetry(3, 1000);
      
      // Reset message input
      setMessage('');
      
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
      // Note: we keep isAgentThinking true until we get a response
    }
  };

  // File selection handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
    }
  };

  // Handle file upload button click
  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Upload file to server
  const handleFileUpload = async () => {
    if (!selectedFile || isUploading) return;
    
    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('userId', userId || '');
      
      // Add sessionId if available
      if (activeSessionId || sessionId) {
        formData.append('sessionId', activeSessionId || sessionId);
      }
      
      // Determine API endpoint
      const protocol = window.location.protocol;
      const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
      const uploadUrl = `${protocol}//${host}/api/upload`;
      
      console.log("Uploading file to:", uploadUrl);
      console.log("File details:", {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
        userId: userId
      });
      
      // First check if the API is reachable at all
      try {
        const testResponse = await fetch(`${protocol}//${host}/api/test`);
        if (!testResponse.ok) {
          console.error("API test endpoint failed", await testResponse.text());
          throw new Error("API server is not responding correctly");
        } else {
          console.log("API test endpoint success:", await testResponse.json());
        }
      } catch (testError) {
        console.error("Error testing API connectivity:", testError);
      }
      
      // Now try the upload - note: we don't set Content-Type header manually
      // as the browser will set it correctly with the boundary for multipart/form-data
      const response = await fetch(uploadUrl, {
        method: 'POST',
        // Don't set Content-Type header for FormData - browser needs to set it with boundary
        // headers: { 'Content-Type': 'multipart/form-data' }, // This is incorrect and will cause problems
        body: formData,
        // Make sure credentials are included properly
        credentials: 'include',
        mode: 'cors'
      });
      
      console.log("Upload response status:", response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Upload error response:", errorText);
        throw new Error(`File upload failed (${response.status}): ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Upload response data:", data);
      
      // If upload was successful, store the file info
      if (data.success) {
        console.log("File upload successful. Setting uploadedFile with fileId:", data.fileId);
        
        // Store the file info in state
        setCurrentUploadedFile({
          fileId: data.fileId,
          fileName: data.fileName,
          mimeType: data.mimeType
        });
        
        // Add a confirmation message to the UI
        alert(`File ${data.fileName} uploaded successfully! Now send a message to discuss the file.`);
        
        // If a sessionId was returned and we don't have one, use it
        if (data.sessionId && !sessionId && !activeSessionId) {
          setSessionId(data.sessionId);
          initializeWebSocket(data.sessionId);
        }
      } else {
        throw new Error("Upload completed but server reported failure");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel file upload
  const handleCancelUpload = () => {
    setSelectedFile(null);
    setCurrentUploadedFile(null);
  };

  // Effect to upload file when selected
  useEffect(() => {
    if (selectedFile) {
      handleFileUpload();
    }
  }, [selectedFile]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Fetch chat history with real-time updates
  useEffect(() => {
    if (!userId) return;
    
    console.log("Setting up chat history listener for userId:", userId);
    
    // Get Firestore instance
    const db = getFirestore();
    
    // Create a query for this user's chat sessions
    const chatSessionsQuery = query(
      collection(db, 'chat_sessions'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );
    
    // Set up real-time listener with onSnapshot
    const unsubscribe = onSnapshot(chatSessionsQuery, (snapshot) => {
      try {
        console.log("Chat sessions snapshot received, count:", snapshot.docs.length);
        
        // Transform the Firebase documents to our ChatSession type
        const formattedSessions = snapshot.docs.map(doc => {
          const data = doc.data();
          
          // Properly handle timestamps from Firebase
          const createdAt = data.createdAt?.toDate ? 
            data.createdAt.toDate() : 
            data.createdAt ? new Date(data.createdAt) : new Date();
            
          const updatedAt = data.updatedAt?.toDate ? 
            data.updatedAt.toDate() : 
            data.updatedAt ? new Date(data.updatedAt) : new Date();
          
          // Properly handle messages from Firebase
          const messages = (data.messages || []).map((msg: any) => ({
            id: msg.id || Date.now().toString(),
            text: msg.text || '',
            sender: msg.sender || 'agent',
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          
          return {
            id: doc.id,
            userId: data.userId,
            createdAt: createdAt,
            updatedAt: updatedAt,
            messages: messages
          } as ChatSession;
        });
        
        console.log("Formatted chat sessions:", formattedSessions);
        setChatSessions(formattedSessions);
        
        // If we don't have an active session yet, set it to the most recent one
        if (!activeSessionId && formattedSessions.length > 0) {
          console.log("Setting active session to first session:", formattedSessions[0].id);
          setActiveSessionId(formattedSessions[0].id);
          
          // Load messages for this session
          if (formattedSessions[0].messages?.length > 0) {
            console.log("Loading messages from first session:", formattedSessions[0].messages.length, "messages");
            setMessages(formattedSessions[0].messages);
          } else {
            setMessages([]);
          }
        }
        
        // If we have no sessions yet, create one
        if (formattedSessions.length === 0) {
          console.log("No chat sessions found, creating a new one");
          createChatSession(userId).then(newSessionId => {
            console.log("Created new session:", newSessionId);
            setActiveSessionId(newSessionId);
            setMessages([]);
          });
        }
        
        // If our active session has been updated, reload its messages
        if (activeSessionId) {
          const activeSession = formattedSessions.find(s => s.id === activeSessionId);
          if (activeSession) {
            console.log("Updating messages for active session from snapshot");
            setMessages(activeSession.messages);
          }
        }
      } catch (error) {
        console.error("Error processing chat sessions snapshot:", error);
      }
    }, (error) => {
      console.error("Error in chat sessions listener:", error);
    });
    
    // Clean up the listener when component unmounts
    return () => {
      console.log("Cleaning up chat sessions listener");
      unsubscribe();
    };
  }, [userId]);

  // When active session ID changes, update the WebSocket connection
  useEffect(() => {
    if (activeSessionId && userId) {
      console.log("Active session ID changed to:", activeSessionId, "- updating WebSocket connection");
      
      // Close existing socket if any
      if (socket) {
        console.log("Closing existing WebSocket connection");
        socket.close();
      }
      
      // Initialize new WebSocket with the updated session ID
      setTimeout(() => {
        // Update the sessionId state first to ensure it's used in initializeWebSocket
        setSessionId(activeSessionId);
        
        // Then initialize WebSocket with a small delay to ensure sessionId is updated
        setTimeout(() => {
          console.log("Initializing new WebSocket with session ID:", activeSessionId);
          initializeWebSocket();
        }, 200);
      }, 200);
    }
  }, [activeSessionId, userId]);

  // Start a new chat session
  const handleNewChat = async () => {
    if (!userId) return;
    console.log("Creating new chat session");
    
    try {
      // First save current messages if there are any
      if (activeSessionId && messages.length > 0) {
        console.log("Saving current session before creating new chat");
        await updateChatSessionMessages(activeSessionId, messages);
      }
      
      // Now create a new session
      const newSessionId = await createChatSession(userId);
      console.log("New session created:", newSessionId);
      
      // Update chat sessions to immediately show the new chat in history
      const newSession: ChatSession = {
        id: newSessionId,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: []
      };
      
      setChatSessions(prevSessions => [newSession, ...prevSessions]);
      
      // Set the new session as active and clear messages
      setActiveSessionId(newSessionId);
      setMessages([]);
      
      // Update sessionId for WebSocket
      setSessionId(newSessionId);
      
      // Reinitialize WebSocket with the new session ID
      setTimeout(() => {
        console.log("Reinitializing WebSocket with new session ID");
        initializeWebSocket();
      }, 300);
    } catch (error) {
      console.error("Error creating new chat session:", error);
    }
  };

  // Handle selecting a chat session from history
  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === activeSessionId) return; // Skip if already selected
    console.log("Selecting session:", sessionId);
    
    try {
      // First save current messages if needed
      if (activeSessionId && messages.length > 0) {
        console.log("Saving current session before switching");
        await updateChatSessionMessages(
          activeSessionId,
          messages
        );
      }
      
      // Find the session in our local state
      const selectedSession = chatSessions.find(s => s.id === sessionId);
      
      if (selectedSession && selectedSession.messages) {
        console.log("Loading messages from selected session:", selectedSession.messages.length, "messages");
        setMessages(selectedSession.messages);
      } else {
        console.log("Loading messages from Firestore for session:", sessionId);
        const session = await getChatSessionById(sessionId) as any;
        if (session && session.messages) {
          const processedMessages = session.messages.map((msg: any) => ({
            id: msg.id || Date.now().toString(),
            text: msg.text || '',
            sender: msg.sender as 'user' | 'agent',
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          setMessages(processedMessages);
        } else {
          setMessages([]);
        }
      }
      
      // Set the new active session
      setActiveSessionId(sessionId);
    } catch (error) {
      console.error("Error selecting chat session:", error);
    }
  };

  // Handle deleting a chat session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // Prevent triggering the click on the history item
    
    if (window.confirm('Are you sure you want to delete this chat?')) {
      try {
        console.log("Deleting chat session:", sessionId);
        await deleteChatSession(sessionId);
        
        // If it was the active session, set a new active session
        if (sessionId === activeSessionId) {
          const remainingSessions = chatSessions.filter(s => s.id !== sessionId);
          if (remainingSessions.length > 0) {
            setActiveSessionId(remainingSessions[0].id);
          } else {
            // No more sessions, create a new one
            const newSessionId = await createChatSession(userId!);
            setActiveSessionId(newSessionId);
            setMessages([]);
          }
        }
      } catch (error) {
        console.error("Error deleting chat session:", error);
      }
    }
  };

  // When activeSessionId changes, load the corresponding messages from Firestore
  useEffect(() => {
    if (!activeSessionId) return;
    
    console.log("Active session changed to:", activeSessionId);
    
    // Find the session in our local state first (to avoid an extra Firestore read)
    const currentSession = chatSessions.find(s => s.id === activeSessionId);
    if (currentSession && currentSession.messages) {
      console.log("Loading messages from local state, count:", currentSession.messages.length);
      
      // Properly parse messages and convert timestamps to Date objects
      const mappedMessages = currentSession.messages.map(msg => {
        // Create a new message object with properly typed timestamp
        return {
          id: msg.id || Date.now().toString(),
          text: msg.text || '',
          sender: msg.sender as 'user' | 'agent',
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
        };
      });
      
      setMessages(mappedMessages);
    } else {
      // If we don't have it locally (rare case), fetch from Firestore
      console.log("Loading messages from Firestore for session:", activeSessionId);
      const loadSession = async () => {
        try {
          const session = await getChatSessionById(activeSessionId) as any;
          if (session) {
            console.log("Session loaded from Firestore, messages:", session.messages?.length || 0);
            
            // Properly parse messages from Firestore data
            const mappedMessages = (session.messages || []).map((msg: any) => {
              return {
                id: msg.id || Date.now().toString(),
                text: msg.text || '',
                sender: msg.sender as 'user' | 'agent',
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
              };
            });
            
            setMessages(mappedMessages);
          } else {
            console.log("No session found in Firestore, creating an empty one");
            setMessages([]);
          }
        } catch (error) {
          console.error("Error loading session:", error);
          setMessages([]);
        }
      };
      loadSession();
    }
  }, [activeSessionId, chatSessions]);

  // Render uploaded file attachment in the message input area
  const renderFileAttachment = () => {
    if (!currentUploadedFile) return null;
    
    const { fileName, mimeType } = currentUploadedFile;
    const isImage = mimeType?.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    const isWord = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                  mimeType === 'application/msword';
    const isText = mimeType?.startsWith('text/');
    
    let fileIcon = <FaFile />;
    let fileTypeClass = '';
    
    if (isImage) {
      fileIcon = <FaFile className="file-icon-image" />;
      fileTypeClass = 'file-icon-image';
    } else if (isPdf) {
      fileIcon = <FaFile className="file-icon-pdf" />;
      fileTypeClass = 'file-icon-pdf';
    } else if (isWord) {
      fileIcon = <FaFile className="file-icon-word" />;
      fileTypeClass = 'file-icon-word';
    } else if (isText) {
      fileIcon = <FaFile className="file-icon-text" />;
      fileTypeClass = 'file-icon-text';
    }
    
    return (
      <div className="file-attachment-preview">
        <div className="file-icon-wrapper">
          {fileIcon}
          <span>{fileName}</span>
          <span className="file-type-label">{getFileTypeLabel(mimeType || '')}</span>
        </div>
        <button
          type="button"
          className="cancel-upload-btn"
          onClick={handleCancelUpload}
          title="Remove file"
        >
          <FaTimes />
        </button>
      </div>
    );
  };

  // Get user-friendly file type label
  const getFileTypeLabel = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
    if (mimeType === 'application/msword') return 'DOC';
    if (mimeType === 'text/plain') return 'Text';
    if (mimeType === 'text/csv') return 'CSV';
    
    // Extract type from MIME type (e.g., "application/json" -> "JSON")
    const parts = mimeType.split('/');
    if (parts.length > 1) {
      return parts[1].toUpperCase();
    }
    
    return 'File';
  };

  // Render file in message
  const renderMessageFile = (msg: Message) => {
    if (msg.fileId && msg.fileName) {
      const fileType = msg.fileType || 'application/octet-stream';
      const isImage = fileType.startsWith('image/');
      const isPdf = fileType === 'application/pdf';
      const isWord = fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                     fileType === 'application/msword';
      const isText = fileType.startsWith('text/');
      
      let fileIcon = <FaFile />;
      
      // Choose appropriate icon based on file type
      if (isImage) {
        fileIcon = <FaFile className="file-icon-image" />;
      } else if (isPdf) {
        fileIcon = <FaFile className="file-icon-pdf" />;
      } else if (isWord) {
        fileIcon = <FaFile className="file-icon-word" />;
      } else if (isText) {
        fileIcon = <FaFile className="file-icon-text" />;
      }
      
      return (
        <div className="message-file">
          <div className={`file-info ${isImage ? 'image-file' : ''}`}>
            {fileIcon}
            <span>{msg.fileName}</span>
            <span className="file-type-label">{getFileTypeLabel(fileType)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Retry function for API calls
  const callApiWithRetry = async (retries = 3, delay = 1000) => {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        const currentSessionId = activeSessionId || sessionId || `session_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`API attempt ${i+1}/${retries}:`, {
          message: message,
          userId: userId,
          sessionId: currentSessionId,
          fileId: currentUploadedFile?.fileId
        });
        
        // Determine API endpoint
        const protocol = window.location.protocol;
        const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
        const apiUrl = `${protocol}//${host}/api/message`;
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          mode: 'cors',
          body: JSON.stringify({
            message: message,
            userId: userId,
            sessionId: currentSessionId,
            fileId: currentUploadedFile?.fileId
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API error:', response.status, errorText);
          throw new Error(`Server error: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        console.log('API response:', data);
        
        // If the session ID from the server is different, update it
        if (data.sessionId && data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
        }
        
        // Add agent response to chat
        const agentResponse: Message = {
          id: (Date.now() + 1).toString(),
          text: data.response,
          sender: 'agent',
          timestamp: new Date()
        };
        
        // Update messages state with the agent response
        const updatedMessages = [...messages, agentResponse];
        setMessages(updatedMessages);
        
        // Save to Firestore with the agent response
        const sessionToUse = currentSessionId;
        if (sessionToUse) {
          try {
            await updateChatSessionMessages(sessionToUse, updatedMessages);
          } catch (error) {
            console.error("Error saving agent response to Firestore:", error);
          }
        }
        
        setIsAgentThinking(false);
        return data;
      } catch (error) {
        console.error(`Attempt ${i+1} failed:`, error);
        lastError = error;
        
        // Wait before retrying
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all retries failed
    setIsAgentThinking(false);
    
    // Add error message to chat
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      text: `Sorry, there was an error processing your request: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
      sender: 'agent',
      timestamp: new Date()
    };
    
    // Update messages state with the error message
    const updatedMessages = [...messages, errorMessage];
    setMessages(updatedMessages);
    
    throw lastError;
  };

  // Specialized function to parse medical report formatting
  const parseMarkdown = (text: string): React.ReactNode => {
    // Helper function to safely escape HTML
    const escapeHtml = (unsafe: string) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    
    // Helper to determine result CSS class
    const getResultClass = (result: string): string => {
      const normalizedResult = result.toLowerCase();
      if (['elevated', 'high', 'abnormal', 'positive'].includes(normalizedResult)) {
        return 'medical-result-high';
      } else if (['normal', 'sufficient'].includes(normalizedResult)) {
        return 'medical-result-normal';
      } else if (['low', 'insufficient', 'negative'].includes(normalizedResult)) {
        return 'medical-result-low';
      } else if (['borderline'].includes(normalizedResult)) {
        return 'medical-result-borderline';
      }
      return 'medical-result';
    };
    
    // Process the text line by line
    const lines = text.split('\n');
    
    return (
      <>
        {lines.map((line, lineIndex) => {
          let processedLine = escapeHtml(line);
          let isListItem = false;
          
          // Check for different line patterns we want to format
          
          // Pattern 1: Lines starting with *Text* - medical report section headers
          // Example: "*Liver & Kidney Panel:*" 
          if (/^\s*\*([^*]+?)\*:/.test(line)) {
            isListItem = true;
            processedLine = processedLine.replace(/^\s*\*([^*]+?)\*:/, '<span class="medical-panel-name">$1:</span>');
          } 
          // Pattern 2: Lines starting with a simple asterisk - bullet points
          else if (/^\s*\*\s/.test(line)) {
            isListItem = true;
            processedLine = processedLine.replace(/^\s*\*\s/, '');
          }
          
          // Now handle inline formatting within the line
          
          // Pattern 3: **bold text** - double asterisks for emphasis
          processedLine = processedLine.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
          
          // Pattern 4: *emphasized text* - single asterisks for emphasis (not at beginning of line)
          if (!isListItem || !processedLine.startsWith('*')) {
            processedLine = processedLine.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
          }
          
          // Handle numeric values and medical terminology
          // 1. Highlight value ranges with comparison operators
          processedLine = processedLine.replace(/((?:&lt;|&gt;|=|≤|≥)\s*\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L|U\/L|g\/dL|%|mg|kg|cm|mm|m²)/g, 
            '<span class="medical-range">$1</span> <span class="medical-unit">$2</span>');
          
          // 2. Highlight normal numeric values with units
          processedLine = processedLine.replace(/(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(mg\/dL|mmol\/L|U\/L|g\/dL|%|mg|kg|cm|mm|m²)/g, 
            '<span class="medical-value">$1</span> <span class="medical-unit">$2</span>');
          
          // 3. Highlight common medical test names
          processedLine = processedLine.replace(/\b(HDL|LDL|VLDL|Cholesterol|Triglycerides|Glucose|Hemoglobin|A1c|HbA1c|TSH|T3|T4|CMP|CBC|BUN|Creatinine|GFR|AST|ALT|Albumin|Globulin|Bilirubin|Alkaline Phosphatase|ALP|RBC|WBC|Platelets|Neutrophils|Lymphocytes|Monocytes|Eosinophils|Basophils|Vitamin [ADBE]\d*|MCH|MCHC|MCV)\b/g, 
            '<span class="medical-test">$1</span>');
          
          // 4. Highlight medical test results
          processedLine = processedLine.replace(/\b(elevated|normal|high|low|positive|negative|borderline|abnormal|sufficient|insufficient)\b/gi, 
            (match) => {
              const className = getResultClass(match);
              return `<span class="${className}">${match}</span>`;
            });
          
          // 5. Highlight reference range indicators
          processedLine = processedLine.replace(/\b(reference range|normal range|within normal limits|WNL)\b/gi, 
            '<span class="reference-range">$1</span>');
          
          // Render as a list item or a regular paragraph
          if (isListItem) {
            return (
              <div key={lineIndex} className="markdown-list-item">
                <span className="markdown-bullet">•</span>
                <span dangerouslySetInnerHTML={{ __html: processedLine }} />
              </div>
            );
          } else {
            return (
              <div key={lineIndex} className="markdown-paragraph">
                <span dangerouslySetInnerHTML={{ __html: processedLine }} />
              </div>
            );
          }
        })}
      </>
    );
  };

  // Update the renderMessageContent function to properly display messages with files
  const renderMessageContent = (msg: Message) => {
    return (
      <>
        {/* Render attached file if present */}
        {msg.fileId && msg.fileName && renderMessageFile(msg)}
        
        {/* Render message text with markdown support */}
        <div className="message-text">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              // Customize table styling
              table: ({node, ...props}) => (
                <div className="markdown-table-container">
                  <table className="markdown-table" {...props} />
                </div>
              ),
              thead: ({node, ...props}) => <thead className="markdown-table-head" {...props} />,
              tbody: ({node, ...props}) => <tbody className="markdown-table-body" {...props} />,
              tr: ({node, ...props}) => <tr className="markdown-table-row" {...props} />,
              th: ({node, ...props}) => <th className="markdown-table-header" {...props} />,
              td: ({node, ...props}) => <td className="markdown-table-cell" {...props} />,
              
              // For medical styling, add custom classes
              strong: ({node, ...props}) => <strong className="medical-emphasis" {...props} />,
              em: ({node, ...props}) => <em className="medical-italic" {...props} />,
              
              // Special styling for lists
              li: ({node, children, ...props}) => (
                <li className="markdown-list-item-rendered" {...props}>
                  {children}
                </li>
              ),
              
              // Add paragraph styling
              p: ({node, ...props}) => <p className="markdown-paragraph-rendered" {...props} />
            }}
          >
            {msg.text}
          </ReactMarkdown>
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your chat...</p>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {showNamePrompt && (
        <div className="name-prompt-overlay">
          <div className="name-prompt-container">
            <h2>Welcome to MediAgent!</h2>
            <p>Please enter your name to personalize your experience:</p>
            <form onSubmit={handleUpdateName}>
              <input 
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter your full name"
                className="name-input"
              />
              <button type="submit" className="name-submit-btn">Save</button>
            </form>
          </div>
        </div>
      )}
      
      <aside className={`chat-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <h2>MediAgent</h2>
          <div className="sidebar-circle"></div>
        </div>
        
        {/* Chat History Section */}
        {!sidebarCollapsed && (
          <>
            <div className="chat-history-section">
              <div className="chat-history-title">History</div>
              {chatSessions.length === 0 ? (
                <div className="no-history-message">No previous chats</div>
              ) : (
                <ul className="chat-history-list">
                  {chatSessions.map(session => {
                    // Determine a good display title for the chat
                    let sessionTitle = 'New Chat';
                    
                    // If it's a completely new session without messages, make it clearer
                    if (session.id === activeSessionId && messages.length === 0) {
                      sessionTitle = 'Current Chat';
                    }
                    // Try to find the first user message to use as title
                    else if (session.messages && session.messages.length > 0) {
                      // Find the first user message
                      const firstUserMsg = session.messages.find(msg => msg.sender === 'user');
                      if (firstUserMsg) {
                        sessionTitle = firstUserMsg.text.slice(0, 25) + (firstUserMsg.text.length > 25 ? '...' : '');
                      } else {
                        // If no user message, fall back to any message
                        const firstMsg = session.messages.find(msg => msg.text.trim() !== '');
                        if (firstMsg) {
                          sessionTitle = firstMsg.text.slice(0, 25) + (firstMsg.text.length > 25 ? '...' : '');
                        }
                      }
                    }
                    
                    // Format date for display - more readable format
                    const sessionDate = session.updatedAt ? 
                      new Date(session.updatedAt).toLocaleString(undefined, { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      }) : '';
                    
                    return (
                      <li
                        key={session.id}
                        className={`chat-history-item${session.id === activeSessionId ? ' selected' : ''}`}
                        onClick={() => handleSelectSession(session.id)}
                        title={`${sessionTitle} - ${sessionDate}`}
                      >
                        <span className="history-dot"></span>
                        <div className="history-item-content">
                          <div className="history-item-title">{sessionTitle}</div>
                          {sessionDate && <div className="history-item-date">{sessionDate}</div>}
                        </div>
                        <button 
                          className="delete-history-btn" 
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          title="Delete chat"
                        >
                          &times;
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            
            <div className="sidebar-spacer"></div>
            
            {/* Patient Profile moved down */}
            <div className="patient-profile">
              <div className="profile-container">
                <div className="profile-image">
                  <span className="initial">{(patientInfo.name || userData?.name || auth.currentUser?.displayName || '?')[0]}</span>
                </div>
                <div className="profile-info">
                  <h3>{patientInfo.name || userData?.name || auth.currentUser?.displayName || 'Patient'}</h3>
                  <p>{patientInfo.email || userData?.email || auth.currentUser?.email || 'No email available'}</p>
                </div>
              </div>
            </div>
            
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </>
        )}
        
        {/* Toggle Button */}
        <button 
          className="sidebar-toggle-btn" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? '❯' : '❮'}
        </button>
      </aside>
      
      <main className={`chat-main ${sidebarCollapsed ? 'expanded' : ''}`}>
        <header className="chat-header">
          <div>
            <h1>AI Medical Agent</h1>
            <p>Ask me anything about your health</p>
          </div>
          <div className="chat-controls">
            <button className="control-btn" onClick={handleNewChat}>New Chat</button>
          </div>
        </header>
        
        <div className="messages-container">
          {messages.map(msg => (
            <div 
              key={msg.id} 
              className={`message ${msg.sender === 'user' ? 'user-message' : 'agent-message'}`}
            >
              {msg.sender === 'agent' ? (
                <div className="agent-message-wrapper">
                  <div className="agent-avatar">
                    <span className="agent-avatar-initial">M</span>
                  </div>
                  <div className="message-content">
                    {renderMessageContent(msg)}
                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                  </div>
                </div>
              ) : (
                <div className="message-content">
                  {renderMessageContent(msg)}
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                </div>
              )}
            </div>
          ))}
          
          {isAgentThinking && (
            <div className="message agent-message">
              <div className="agent-message-wrapper">
                <div className="agent-avatar">
                  <span className="agent-avatar-initial">M</span>
                </div>
                <div className="message-content thinking-animation">
                  <p className="thinking-text">MediAgent is thinking<span className="dot-1">.</span><span className="dot-2">.</span><span className="dot-3">.</span></p>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSendMessage} className="message-form">
          <div className="message-input-container">
            {/* File upload button */}
            <button
              type="button"
              className="file-upload-btn"
              onClick={handleFileButtonClick}
              title="Attach a file"
              disabled={isUploading}
            >
              <FaPaperclip />
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="file-input"
              accept="image/*,.pdf,.doc,.docx,.txt,.csv"
            />
            
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isSending || isUploading}
              className="message-input"
            />
            
            <button 
              type="submit" 
              className="send-button"
              disabled={(!message.trim() && !currentUploadedFile) || isSending || isUploading}
            >
              {isSending ? <FaSpinner className="spin" /> : <FaPaperPlane />}
            </button>
            
            {/* Display uploading indicator */}
            {isUploading && (
              <div className="uploading-indicator">
                <FaFileUpload className="spin" />
                <span>Uploading file...</span>
              </div>
            )}
            
            {/* Display attached file */}
            {renderFileAttachment()}
          </div>
        </form>
      </main>
    </div>
  );
};

export default PatientChat; 