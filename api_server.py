from fastapi import FastAPI, WebSocket, Request, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
import uuid
import logging
import mimetypes
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
import datetime
from fastapi import WebSocketDisconnect

# Import Google ADK-specific types
import google.genai.types as types

# Import ADK specific modules
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.runners import Runner

# Import the agent definitions from the medical_agent module
from medical_agent.agent import root_agent

# Helper function to create a proper artifact for ADK
def create_adk_artifact(mime_type, data):
    """
    Create an artifact in the format expected by Google ADK.
    
    Args:
        mime_type (str): MIME type of the data
        data (bytes): Binary data of the file/artifact
        
    Returns:
        types.Part: A properly formatted Part object with inline_data set
    """
    try:
        # Create the artifact exactly as per Google ADK documentation
        # https://google.github.io/adk-docs/artifacts/
        blob = types.Blob(
            mime_type=mime_type,
            data=data
        )
        
        # Create Part with inline_data set to the Blob
        part = types.Part(inline_data=blob)
        
        logger.info(f"Successfully created artifact: mime_type={mime_type}, data_size={len(data)} bytes")
        return part
    except Exception as e:
        logger.error(f"Error creating artifact: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Traceback: {trace}")
        return None

# Helper function to verify artifact structure
def verify_artifact_structure(artifact):
    """Verify the structure of an artifact to ensure it will work with the model."""
    try:
        if not artifact:
            logger.warning("Artifact is None or empty")
            return False
            
        logger.info(f"Verifying artifact structure: type={type(artifact)}")
        
        # Check for Part object or compatibility
        if not hasattr(artifact, 'inline_data') and not isinstance(artifact, types.Part):
            logger.warning(f"Artifact is neither a Part object nor has inline_data attribute: {type(artifact)}")
            return False
            
        # Get inline_data
        inline_data = artifact.inline_data
        logger.info(f"inline_data: type={type(inline_data)}")
        
        # Check if inline_data has required properties for a Blob
        if not hasattr(inline_data, 'mime_type') and not (isinstance(inline_data, dict) and 'mime_type' in inline_data):
            logger.warning(f"inline_data doesn't have mime_type: {inline_data}")
            return False
            
        # Check for data attribute in various formats
        has_data = False
        data_size = 0
        
        if hasattr(inline_data, 'data'):
            has_data = True
            data_size = len(inline_data.data) if inline_data.data else 0
        elif isinstance(inline_data, dict) and 'data' in inline_data:
            has_data = True
            data_size = len(inline_data['data']) if inline_data['data'] else 0
            
        if not has_data:
            logger.warning("inline_data does not have 'data' in any recognized format")
            return False
            
        # Get mime_type in the correct format
        mime_type = None
        if hasattr(inline_data, 'mime_type'):
            mime_type = inline_data.mime_type
        elif isinstance(inline_data, dict) and 'mime_type' in inline_data:
            mime_type = inline_data['mime_type']
            
        logger.info(f"Artifact structure verified: mime_type={mime_type}, data size={data_size} bytes")
        return True
    except Exception as e:
        logger.error(f"Error verifying artifact structure: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Verification traceback: {trace}")
        return False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set up session service and artifact service
session_service = InMemorySessionService()
artifact_service = InMemoryArtifactService()

# Define application constants
APP_NAME = "medical_agent"

# Initialize the runner with our root agent
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service,
    artifact_service=artifact_service
)

# Create FastAPI app
app = FastAPI(title="Medical Agent API")

try:
    # Import and check for python-multipart
    import multipart
    logger.info("python-multipart is installed and imported")
except ImportError:
    logger.warning("python-multipart is not installed. File uploads may not work correctly.")
    logger.warning("Install it with: pip install python-multipart")

# Add CORS middleware - CRITICAL: This must be configured properly to handle preflight OPTIONS requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Add a special middleware to log all requests for debugging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests for debugging"""
    path = request.url.path
    method = request.method
    logger.info(f"Request: {method} {path}")
    
    # Print all request headers for debugging
    logger.info(f"Request headers: {request.headers}")
    
    response = await call_next(request)
    
    logger.info(f"Response status: {response.status_code}")
    return response

# Store active connections
active_connections: Dict[str, WebSocket] = {}

# Store session IDs
sessions: Dict[str, str] = {}

# Model for incoming messages from frontend
class MessageRequest(BaseModel):
    message: str
    userId: str
    sessionId: Optional[str] = None
    fileId: Optional[str] = None  # Add fileId field for referencing uploaded files

# Add OPTIONS route handler explicitly for the /api/message endpoint
@app.options("/api/message")
async def options_message():
    return {}

# Add OPTIONS route handler for the file upload endpoint
@app.options("/api/upload")
async def options_upload():
    return {}

@app.get("/", response_class=HTMLResponse)
async def get_home():
    """Serve the home page"""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Medical Agent</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8f9fa;
            }
            #chat-container {
                border: 1px solid #ddd;
                border-radius: 10px;
                padding: 15px;
                height: 500px;
                overflow-y: auto;
                margin-bottom: 15px;
                background-color: white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .user-message {
                background-color: #1e88e5;
                color: white;
                padding: 12px 15px;
                border-radius: 18px 18px 0 18px;
                margin-bottom: 15px;
                max-width: 70%;
                margin-left: auto;
                word-wrap: break-word;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                line-height: 1.4;
            }
            .agent-message {
                background-color: #f1f1f1;
                color: #333;
                padding: 12px 15px;
                border-radius: 18px 18px 18px 0;
                margin-bottom: 15px;
                max-width: 70%;
                word-wrap: break-word;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                line-height: 1.4;
            }
            .file-info {
                background-color: #e8f5e9;
                border-radius: 8px;
                padding: 10px;
                margin-top: 5px;
                margin-bottom: 5px;
                display: flex;
                align-items: center;
                font-size: 0.9em;
            }
            .file-icon {
                margin-right: 8px;
                font-size: 1.2em;
            }
            .file-pdf {
                color: #e53935;
            }
            .file-image {
                color: #43a047;
            }
            .file-doc {
                color: #1976d2;
            }
            #message-form {
                display: flex;
            }
            #message-input {
                flex-grow: 1;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 25px;
                margin-right: 12px;
                font-size: 14px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }
            button {
                padding: 10px 20px;
                background-color: #1e88e5;
                color: white;
                border: none;
                border-radius: 25px;
                cursor: pointer;
                font-weight: bold;
                box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                transition: background-color 0.2s;
            }
            button:hover {
                background-color: #1976d2;
            }
            #file-upload-form {
                display: flex;
                margin-bottom: 15px;
                align-items: center;
            }
            #file-input {
                flex: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 25px;
                background-color: white;
            }
            #upload-button {
                background-color: #43a047;
            }
            #upload-button:hover {
                background-color: #388e3c;
            }
            #upload-status {
                margin-top: 8px;
                font-size: 14px;
            }
            h1 {
                color: #2e7d32;
                margin-bottom: 20px;
                border-bottom: 2px solid #e0e0e0;
                padding-bottom: 10px;
            }
            pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                background-color: #f8f9fa;
                padding: 8px;
                border-radius: 5px;
                margin: 5px 0;
                font-family: monospace;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <h1>Medical Agent</h1>
        <div id="chat-container"></div>
        
        <!-- Add file upload form -->
        <div style="margin-bottom: 15px;">
            <form id="file-upload-form" enctype="multipart/form-data">
                <div style="flex: 1; position: relative;">
                    <input type="file" id="file-input" name="file">
                    <label for="file-input" style="display: none;">Choose file</label>
                </div>
                <button type="submit" id="upload-button">Upload</button>
            </form>
            <div id="upload-status" style="margin-top: 8px; font-size: 14px;"></div>
        </div>
        
        <form id="message-form">
            <input type="text" id="message-input" placeholder="Type your query..." required>
            <button type="submit">Send</button>
        </form>

        <script>
            const chatContainer = document.getElementById('chat-container');
            const messageForm = document.getElementById('message-form');
            const messageInput = document.getElementById('message-input');
            let socket;
            let sessionId;
            let currentFileId = null; // Track the current file ID

            // Generate a unique user ID
            const userId = 'user_' + Math.random().toString(36).substr(2, 9);

            // Function to add a message to the chat container
            function addMessage(text, isUser) {
                const messageDiv = document.createElement('div');
                messageDiv.className = isUser ? 'user-message' : 'agent-message';
                
                // Check if the message is about a file upload
                if (text.includes('File uploaded:') && isUser) {
                    const fileName = text.replace('File uploaded: ', '').trim();
                    
                    // Determine file type to show appropriate icon
                    let fileType = 'file';
                    let iconClass = 'file-icon';
                    
                    if (fileName.toLowerCase().endsWith('.pdf')) {
                        fileType = 'PDF';
                        iconClass += ' file-pdf';
                    } else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName)) {
                        fileType = 'Image';
                        iconClass += ' file-image';
                    } else if (/\.(doc|docx|txt|rtf)$/i.test(fileName)) {
                        fileType = 'Document';
                        iconClass += ' file-doc';
                    }
                    
                    messageDiv.innerHTML = `
                        <div>I'm uploading a file</div>
                        <div class="file-info">
                            <span class="${iconClass}">📎</span>
                            <span>${fileName} (${fileType})</span>
                        </div>
                    `;
                } else {
                    // For regular text messages, handle possible multi-line content and preserve formatting
                    // Split the text by newlines and wrap them in proper HTML
                    const formattedText = text.split('\n').map(line => {
                        // Check if this line appears to be a PDF or file reference
                        if (line.includes('.pdf') || line.includes('WM17S-2.pdf')) {
                            return `<div class="file-info"><span class="file-icon file-pdf">📄</span> ${line}</div>`;
                        }
                        return `<div>${line}</div>`;
                    }).join('');
                    
                    messageDiv.innerHTML = formattedText;
                }
                
                chatContainer.appendChild(messageDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            // Connect to WebSocket
            function connectWebSocket() {
                sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
                socket = new WebSocket(`ws://${window.location.host}/ws/${userId}/${sessionId}`);

                socket.onopen = function(e) {
                    console.log('WebSocket connection established');
                };

                socket.onmessage = function(event) {
                    const data = JSON.parse(event.data);
                    if (data.type === 'agent_response') {
                        // Format the agent's response nicely, especially for PDF content
                        // Check if response contains file info
                        if (data.fileId) {
                            // Extract the PDF file reference if present
                            let responseText = data.text;
                            
                            // Create a custom formatted response with file info highlighted
                            addMessage(responseText, false);
                            
                            // Mark the file as processed
                            console.log(`File ${data.fileId} processed by agent`);
                        } else {
                            // Regular text message
                            addMessage(data.text, false);
                        }
                        
                        // Reset file ID after message is processed
                        currentFileId = null;
                    }
                };

                socket.onclose = function(event) {
                    console.log('WebSocket connection closed');
                    // Try to reconnect after a delay
                    setTimeout(connectWebSocket, 1000);
                };

                socket.onerror = function(error) {
                    console.error('WebSocket error:', error);
                };
            }

            // Initialize WebSocket connection
            connectWebSocket();

            // Handle form submission
            messageForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const message = messageInput.value.trim();
                if (message) {
                    // Add user message to chat
                    addMessage(message, true);
                    
                    // Send message to server
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        // Include the file ID if we have one
                        const payload = {
                            type: 'user_message',
                            text: message
                        };
                        
                        // Add fileId if there's one available
                        if (currentFileId) {
                            payload.fileId = currentFileId;
                            console.log('Sending message with file ID:', currentFileId);
                        }
                        
                        socket.send(JSON.stringify(payload));
                    } else {
                        addMessage('Connection lost. Trying to reconnect...', false);
                        connectWebSocket();
                    }
                    
                    // Clear input field
                    messageInput.value = '';
                }
            });
            
            // Function to handle file uploads (add this)
            function handleFileUpload(fileData) {
                currentFileId = fileData.fileId;
                addMessage(`File uploaded: ${fileData.fileName}`, true);
            }
            
            // Expose the function globally for external calls
            window.handleFileUpload = handleFileUpload;
            
            // Add file upload functionality
            document.getElementById('file-upload-form').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const fileInput = document.getElementById('file-input');
                const uploadStatus = document.getElementById('upload-status');
                
                if (!fileInput.files || fileInput.files.length === 0) {
                    uploadStatus.textContent = 'Please select a file';
                    uploadStatus.style.color = 'red';
                    return;
                }
                
                const file = fileInput.files[0];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('userId', userId);
                formData.append('sessionId', sessionId);
                
                uploadStatus.textContent = 'Uploading...';
                uploadStatus.style.color = 'blue';
                
                try {
                    const response = await fetch(`/api/upload`, {
                        method: 'POST',
                        body: formData,
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        uploadStatus.textContent = `File uploaded successfully: ${data.fileName}`;
                        uploadStatus.style.color = 'green';
                        
                        // Clear the file input
                        fileInput.value = '';
                        
                        // Set the current file ID for use in the next message
                        currentFileId = data.fileId;
                        
                        // Add file upload message with proper formatting
                        addMessage(`File uploaded: ${data.fileName}`, true);
                        
                        // Add a helpful prompt for the user
                        uploadStatus.innerHTML = `<span style="color:green">✓ File uploaded successfully!</span><br>
                                               <span style="color:#666; font-style:italic">Now you can ask a question about the file.</span>`;
                    } else {
                        throw new Error('Upload completed but server reported failure');
                    }
                } catch (error) {
                    console.error('Error uploading file:', error);
                    uploadStatus.textContent = `Error: ${error.message}`;
                    uploadStatus.style.color = 'red';
                }
            });
        </script>
    </body>
    </html>
    """

@app.get("/api/test")
async def test_api():
    """Test endpoint to verify API functionality"""
    logger.info("Test endpoint called")
    return {"status": "ok", "message": "API is working"}

@app.get("/api/test-artifact")
async def test_artifact():
    """Test endpoint to verify artifact service is working"""
    try:
        # Create a simple text artifact - FOLLOW EXACTLY THE ADK DOCS EXAMPLE
        test_content = "This is a test artifact"
        
        # Create the Part object using our helper function
        test_part = create_adk_artifact("text/plain", test_content.encode('utf-8'))
        
        if not test_part:
            return {
                "status": "error",
                "message": "Failed to create test artifact"
            }
            
        # Verify the artifact structure
        if not verify_artifact_structure(test_part):
            return {
                "status": "error",
                "message": "Test artifact failed verification"
            }
        
        # Save test artifact
        test_id = f"test_{uuid.uuid4().hex}"
        logger.info(f"Saving test artifact with ID: {test_id}")
        
        await artifact_service.save_artifact(
            app_name=APP_NAME,
            user_id="test_user",
            session_id="test_session",
            filename=test_id,
            artifact=test_part
        )
        
        # Load the test artifact to verify it works - CRITICAL FIX: Add await here
        loaded_part = await artifact_service.load_artifact(
            app_name=APP_NAME,
            user_id="test_user",
            session_id="test_session",
            filename=test_id
        )
        
        # Log detailed information about what we got back
        logger.info(f"Loaded artifact type: {type(loaded_part)}")
        logger.info(f"Loaded artifact: {loaded_part}")
        
        # Try to access data according to the ADK documentation structure
        if loaded_part and hasattr(loaded_part, 'inline_data'):
            logger.info(f"inline_data type: {type(loaded_part.inline_data)}")
            logger.info(f"inline_data properties: {dir(loaded_part.inline_data)}")
            
            try:
                # Extract the data according to documentation structure
                loaded_text = loaded_part.inline_data.data.decode('utf-8')
                return {
                    "status": "ok", 
                    "message": "Artifact service is working",
                    "saved": test_content,
                    "loaded": loaded_text
                }
            except Exception as e:
                return {
                    "status": "error",
                    "message": f"Failed to decode loaded artifact: {str(e)}",
                    "part_structure": str(loaded_part),
                    "inline_data_type": str(type(loaded_part.inline_data)),
                    "inline_data_dir": str(dir(loaded_part.inline_data))
                }
        else:
            return {
                "status": "error",
                "message": "Failed to load test artifact",
                "loaded_part": str(loaded_part)
            }
    except Exception as e:
        logger.error(f"Error in test-artifact endpoint: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Traceback: {trace}")
        return {
            "status": "error",
            "message": f"Artifact test failed: {str(e)}",
            "traceback": trace
        }

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    userId: str = Form(...),
    sessionId: Optional[str] = Form(None)
):
    """Handle file uploads and store them as artifacts"""
    logger.info(f"Received file upload: {file.filename} for user {userId}")
    
    # Generate a session ID if not provided
    if not sessionId:
        sessionId = f"session_{uuid.uuid4().hex}"
        
    # Ensure session exists
    if sessionId not in sessions:
        logger.info(f"Creating new session for file upload: user {userId}, session {sessionId}")
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=userId,
            session_id=sessionId
        )
        sessions[sessionId] = sessionId
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Determine the MIME type
        mime_type = file.content_type
        if not mime_type or mime_type == "application/octet-stream":
            # Try to guess the MIME type from the filename
            guessed_type, _ = mimetypes.guess_type(file.filename)
            if guessed_type:
                mime_type = guessed_type
            else:
                mime_type = "application/octet-stream"  # Default fallback
        
        logger.info(f"Creating artifact with mime_type: {mime_type} and file size: {len(file_content)} bytes")
        
        # Create artifact using Google ADK's format
        # As per ADK docs, create a Part with inline_data using a Blob
        blob = types.Blob(
            mime_type=mime_type,
            data=file_content
        )
        file_part = types.Part(inline_data=blob)
        
        # Verify the artifact structure before saving
        if not verify_artifact_structure(file_part):
            raise ValueError("Created artifact failed structure verification")
        
        # Generate a file ID for the artifact - using a more descriptive format
        file_id = f"uploaded_{uuid.uuid4().hex}_{file.filename}"
        
        logger.info(f"About to save artifact {file_id} for user {userId}, session {sessionId}")
        try:
            # Use the artifact service to save the file
            # CRITICAL FIX: Add await here
            save_result = await artifact_service.save_artifact(
                app_name=APP_NAME,
                user_id=userId,
                session_id=sessionId,
                filename=file_id,
                artifact=file_part
            )
            logger.info(f"Successfully saved artifact {file_id}, save result: {save_result}")

            # Verify the artifact was saved by trying to load it back
            logger.info(f"Verifying artifact {file_id} was properly saved by loading it back")
            verification_artifact = await artifact_service.load_artifact(
                app_name=APP_NAME,
                user_id=userId,
                session_id=sessionId,
                filename=file_id
            )
            
            if verification_artifact:
                logger.info(f"Successfully verified artifact {file_id} by loading it back")
                if hasattr(verification_artifact, 'inline_data'):
                    mime_type = getattr(verification_artifact.inline_data, 'mime_type', 'unknown')
                    data_size = len(getattr(verification_artifact.inline_data, 'data', b'')) if hasattr(verification_artifact.inline_data, 'data') else 0
                    logger.info(f"Verification artifact: mime_type={mime_type}, data_size={data_size} bytes")
            else:
                logger.error(f"Verification failed: Could not load saved artifact {file_id}")
                raise ValueError("Artifact was not properly saved")

            logger.info(f"File {file.filename} successfully saved as artifact {file_id}")
        except Exception as e:
            logger.error(f"Error in save/verify artifact process: {e}")
            import traceback
            trace = traceback.format_exc()
            logger.error(f"Save/verify artifact traceback: {trace}")
            raise e
        
        # Return the file ID for reference in messages
        return JSONResponse(content={
            "fileId": file_id,
            "fileName": file.filename,
            "mimeType": mime_type,
            "sessionId": sessionId,
            "success": True
        })
    except Exception as e:
        logger.error(f"Error processing file upload: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Traceback: {trace}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(e),
                "success": False,
                "traceback": trace
            }
        )

@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, session_id: str):
    await websocket.accept()
    logger.info(f"WebSocket connection established for user {user_id} with session {session_id}")
    
    # Store the connection
    connection_id = f"{user_id}_{session_id}"
    active_connections[connection_id] = websocket
    
    # Create a session if it doesn't exist
    if session_id not in sessions:
        logger.info(f"Creating new session for user {user_id} with session {session_id}")
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id
        )
        sessions[session_id] = session_id
    
    try:
        while True:
            # Wait for messages from the client
            data = await websocket.receive_text()
            logger.info(f"Received WebSocket message: {data}")
            message_data = json.loads(data)
            
            if message_data.get("type") == "user_message":
                user_query = message_data.get("text")
                file_id = message_data.get("fileId")
                logger.info(f"Processing user query: {user_query}")
                logger.info(f"File ID from WebSocket message: {file_id}")
                
                # Create parts array for the content
                parts = [types.Part(text=user_query)]
                
                # If a file was referenced, add it to the message parts
                file_part = None
                if file_id:
                    logger.info(f"About to load artifact {file_id} for WebSocket message with params: app_name={APP_NAME}, user_id={user_id}, session_id={session_id}")
                    try:
                        # Log artifact loading parameters
                        logger.info(f"Loading artifact with params: app_name={APP_NAME}, user_id={user_id}, session_id={session_id}, filename={file_id}")
                        
                        # CRITICAL FIX: Add await here to properly resolve the coroutine
                        file_part = await artifact_service.load_artifact(
                            app_name=APP_NAME,
                            user_id=user_id,
                            session_id=session_id,
                            filename=file_id
                        )
                        
                        # Verify we got something back
                        if file_part:
                            logger.info(f"Successfully loaded artifact with ID: {file_id}")
                            
                            # Debug the exact structure of the loaded artifact
                            if hasattr(file_part, 'inline_data'):
                                mime_type = getattr(file_part.inline_data, 'mime_type', 'unknown')
                                data_size = len(getattr(file_part.inline_data, 'data', b'')) if hasattr(file_part.inline_data, 'data') else 0
                                logger.info(f"Artifact mime_type: {mime_type}, data size: {data_size} bytes")
                                logger.info(f"Artifact inline_data type: {type(file_part.inline_data)}")
                                logger.info(f"Artifact inline_data attributes: {dir(file_part.inline_data)}")
                            else:
                                logger.warning(f"Loaded artifact {file_id} does not have inline_data attribute")
                                logger.warning(f"Artifact type: {type(file_part)}")
                                logger.warning(f"Artifact attributes: {dir(file_part)}")
                            
                            # Add the file_part directly to the parts array - this is critical for ADK
                            parts.append(file_part)
                            logger.info(f"Successfully added file {file_id} to WebSocket message parts")
                        else:
                            logger.warning(f"File {file_id} not found in artifacts")
                    except Exception as e:
                        logger.error(f"Error loading artifact {file_id} for WebSocket: {e}")
                        import traceback
                        trace = traceback.format_exc()
                        logger.error(f"Traceback: {trace}")
                
                # Create Content object for ADK runner
                logger.info(f"Creating Content object with {len(parts)} parts for WebSocket message")
                content = types.Content(role='user', parts=parts)
                
                # Log the final content structure
                logger.info(f"Final WebSocket content: role={content.role}, parts_count={len(content.parts)}")
                
                try:
                    # Process agent response events with retry mechanism for network errors
                    final_response_text = "Agent did not produce a final response"
                    logger.info(f"Starting runner.run_async in WebSocket endpoint")
                    
                    # Create a retry mechanism for network errors
                    max_retries = 3
                    retry_delay = 2  # seconds
                    success = False
                    last_error = None
                    
                    for retry_attempt in range(max_retries):
                        try:
                            async_events = runner.run_async(
                                user_id=user_id, 
                                session_id=session_id, 
                                new_message=content
                            )
                            
                            logger.info(f"Processing events from WebSocket run_async (attempt {retry_attempt + 1}/{max_retries})")
                            
                            async for event in async_events:
                                if event.is_final_response():
                                    logger.info(f"Received final response WebSocket event: {event}")
                                    if event.content and event.content.parts:
                                        final_response_text = event.content.parts[0].text
                                        logger.info(f"Extracted WebSocket final response text: {final_response_text[:100]}...")
                                    elif event.actions and event.actions.escalate:
                                        final_response_text = f"Agent escalated: {event.error_message or 'No specific message'}"
                                        logger.warning(f"Agent escalated in WebSocket: {event.error_message}")
                                    success = True
                                    break
                            
                            if success:
                                logger.info(f"WebSocket finished processing agent events successfully")
                                break
                                
                        except Exception as e:
                            last_error = e
                            logger.error(f"Error processing WebSocket async events (attempt {retry_attempt + 1}/{max_retries}): {e}")
                            
                            # Check if this is a network error that we should retry
                            is_network_error = False
                            error_str = str(e).lower()
                            network_error_keywords = ["getaddrinfo", "connection", "network", "timeout", "connect", "unreachable"]
                            
                            for keyword in network_error_keywords:
                                if keyword in error_str:
                                    is_network_error = True
                                    break
                            
                            if is_network_error and retry_attempt < max_retries - 1:
                                logger.info(f"Network error detected, retrying in {retry_delay} seconds...")
                                import traceback
                                trace = traceback.format_exc()
                                logger.error(f"Network error traceback: {trace}")
                                await asyncio.sleep(retry_delay)
                                # Increase delay for next retry attempt
                                retry_delay *= 2
                            else:
                                # Not a network error or last retry attempt
                                import traceback
                                trace = traceback.format_exc()
                                logger.error(f"WebSocket async events traceback: {trace}")
                                if retry_attempt == max_retries - 1:
                                    final_response_text = f"Error processing your request: Network connectivity issue. Please try again later."
                                else:
                                    final_response_text = f"Error processing agent response: {str(e)}"
                                break
                    
                    if not success and last_error:
                        logger.warning(f"All retry attempts failed. Using fallback response.")
                    
                    logger.info(f"Agent responded with: {final_response_text[:100]}...")
                    
                    # Prepare response with file acknowledgment
                    file_prefix = ""
                    if file_id:
                        # Extract just the filename from the full file_id
                        filename = file_id.split('_')[-1] if '_' in file_id else file_id
                        
                        # Add a prefix acknowledging the file type
                        file_type = "file"
                        if file_id and file_part and hasattr(file_part, 'inline_data') and hasattr(file_part.inline_data, 'mime_type'):
                            mime_type = file_part.inline_data.mime_type
                            if mime_type.startswith('image/'):
                                file_type = "image"
                            elif mime_type == 'application/pdf':
                                file_type = "PDF"
                            elif mime_type in ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']:
                                file_type = "document"
                        
                        file_prefix = f"I've received your {file_type} '{filename}'. "
                    
                    # Send the response back to the WebSocket client
                    response_payload = {
                        "type": "agent_response",
                        "text": file_prefix + final_response_text,
                        "timestamp": datetime.datetime.now().isoformat()
                    }
                    
                    # Include file information if a file was used
                    if file_id:
                        response_payload.update({
                            "fileId": file_id,
                            "fileName": file_id.split('_')[-1] if '_' in file_id else file_id,
                            "fileType": getattr(file_part.inline_data, 'mime_type', 'application/octet-stream') if file_part and hasattr(file_part, 'inline_data') else None,
                            "fileProcessed": True
                        })
                    
                    await websocket.send_text(json.dumps(response_payload))
                    logger.info(f"Sent WebSocket response for file: {file_id if file_id else 'None'}")
                
                except Exception as e:
                    logger.error(f"Error processing agent response for WebSocket: {e}")
                    error_payload = {
                        "type": "error",
                        "text": f"Error processing your request: {str(e)}",
                        "timestamp": datetime.datetime.now().isoformat()
                    }
                    await websocket.send_text(json.dumps(error_payload))
            else:
                logger.warning(f"Unknown WebSocket message type: {message_data.get('type')}")
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id} with session {session_id}")
        if connection_id in active_connections:
            logger.info(f"Removing WebSocket connection for {connection_id}")
            del active_connections[connection_id]
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"WebSocket error traceback: {trace}")
        # Try to gracefully close if still connected
        try:
            if connection_id in active_connections:
                del active_connections[connection_id]
            await websocket.close(code=1011, reason=f"Server error: {str(e)}")
        except:
            pass

@app.post("/api/message")
async def send_message(request: MessageRequest):
    """
    Handle message requests from the client
    This is a REST endpoint alternative to the WebSocket connection
    """
    logger.info(f"Received API message request: {request}")
    
    user_id = request.userId
    session_id = request.sessionId if request.sessionId else f"session_{uuid.uuid4().hex}"
    message = request.message
    file_id = request.fileId
    
    # Enhanced logging for API message request
    logger.info(f"Message API detailed info: user_id={user_id}, session_id={session_id}, message={message}, file_id={file_id}")
    
    # Ensure session exists
    if session_id not in sessions:
        logger.info(f"Creating new session for API request: user {user_id}, session {session_id}")
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id
        )
        sessions[session_id] = session_id
    
    try:
        # Create content object from user query
        parts = [types.Part(text=message)]
        
        # If a file was referenced, add it to the message parts
        file_part = None
        if file_id:
            logger.info(f"About to load artifact {file_id} for API message endpoint with params: app_name={APP_NAME}, user_id={user_id}, session_id={session_id}")
            try:
                # Log the parameters we're using to load the artifact
                logger.info(f"Loading artifact with params: app_name={APP_NAME}, user_id={user_id}, session_id={session_id}, filename={file_id}")
                
                # CRITICAL FIX: Add await here to properly resolve the coroutine
                file_part = await artifact_service.load_artifact(
                    app_name=APP_NAME,
                    user_id=user_id,
                    session_id=session_id,
                    filename=file_id
                )
                
                # Verify we got something back
                if file_part:
                    logger.info(f"Successfully loaded artifact with ID: {file_id}")
                    
                    # Debug the exact structure of the loaded artifact
                    if hasattr(file_part, 'inline_data'):
                        mime_type = getattr(file_part.inline_data, 'mime_type', 'unknown')
                        data_size = len(getattr(file_part.inline_data, 'data', b'')) if hasattr(file_part.inline_data, 'data') else 0
                        logger.info(f"API Artifact mime_type: {mime_type}, data size: {data_size} bytes")
                        logger.info(f"API Artifact inline_data type: {type(file_part.inline_data)}")
                        logger.info(f"API Artifact inline_data attributes: {dir(file_part.inline_data)}")
                    else:
                        logger.warning(f"Loaded API artifact {file_id} does not have inline_data attribute")
                        logger.warning(f"API Artifact type: {type(file_part)}")
                        logger.warning(f"API Artifact attributes: {dir(file_part)}")
                    
                    # Add the file_part directly to parts array - this is critical for ADK
                    parts.append(file_part)
                    logger.info(f"Successfully added file {file_id} to message parts for API request")
                else:
                    logger.warning(f"File {file_id} not found in artifacts for API request")
            except Exception as e:
                logger.error(f"Error loading artifact {file_id} for API endpoint: {e}")
                import traceback
                trace = traceback.format_exc()
                logger.error(f"API artifact load traceback: {trace}")
        
        # Create Content object for ADK runner
        logger.info(f"Creating Content object with {len(parts)} parts")
        content = types.Content(role='user', parts=parts)
        
        # Log the final content for debugging
        logger.info(f"Final content: role={content.role}, parts_count={len(content.parts)}")
        for i, part in enumerate(content.parts):
            if hasattr(part, 'text') and part.text:
                logger.info(f"Part {i}: text={part.text[:50]}...")
            elif hasattr(part, 'inline_data') and part.inline_data:
                mime_type = getattr(part.inline_data, 'mime_type', 'unknown')
                data_size = len(getattr(part.inline_data, 'data', b'')) if hasattr(part.inline_data, 'data') else 0
                logger.info(f"Part {i}: inline_data with mime_type={mime_type}, size={data_size} bytes")
        
        # Process the query with the agent
        final_response_text = "Agent did not produce a final response"
        
        # Process agent response events with retry mechanism for network errors
        logger.info(f"Starting runner.run_async in API message endpoint")
        
        # Create a retry mechanism for network errors
        max_retries = 3
        retry_delay = 2  # seconds
        success = False
        last_error = None
        
        for retry_attempt in range(max_retries):
            try:
                async_events = runner.run_async(
                    user_id=user_id, 
                    session_id=session_id, 
                    new_message=content
                )
                
                logger.info(f"Processing events from API message run_async (attempt {retry_attempt + 1}/{max_retries})")
                async for event in async_events:
                    if event.is_final_response():
                        logger.info(f"Received final response API event: {event}")
                        if event.content and event.content.parts:
                            final_response_text = event.content.parts[0].text
                            logger.info(f"Extracted API final response text: {final_response_text[:100]}...")
                        elif event.actions and event.actions.escalate:
                            final_response_text = f"Agent escalated: {event.error_message or 'No specific message'}"
                            logger.warning(f"Agent escalated in API: {event.error_message}")
                        success = True
                        break
                
                if success:
                    logger.info(f"API message finished processing agent events successfully")
                    break
                    
            except Exception as e:
                last_error = e
                logger.error(f"Error processing API message async events (attempt {retry_attempt + 1}/{max_retries}): {e}")
                
                # Check if this is a network error that we should retry
                is_network_error = False
                error_str = str(e).lower()
                network_error_keywords = ["getaddrinfo", "connection", "network", "timeout", "connect", "unreachable"]
                
                for keyword in network_error_keywords:
                    if keyword in error_str:
                        is_network_error = True
                        break
                
                if is_network_error and retry_attempt < max_retries - 1:
                    logger.info(f"Network error detected in API endpoint, retrying in {retry_delay} seconds...")
                    import traceback
                    trace = traceback.format_exc()
                    logger.error(f"API network error traceback: {trace}")
                    await asyncio.sleep(retry_delay)
                    # Increase delay for next retry attempt
                    retry_delay *= 2
                else:
                    # Not a network error or last retry attempt
                    import traceback
                    trace = traceback.format_exc()
                    logger.error(f"API message async events traceback: {trace}")
                    if retry_attempt == max_retries - 1 and is_network_error:
                        # For network errors, provide a user-friendly message on final retry
                        final_response_text = f"Error processing your request: Network connectivity issue. Please try again later."
                    else:
                        # For other errors, pass through
                        raise HTTPException(
                            status_code=500, 
                            detail=f"Error processing agent response: {str(e)}"
                        )
                    break
        
        if not success and last_error and not is_network_error:
            logger.error(f"All API retry attempts failed with non-network error: {last_error}")
            raise HTTPException(
                status_code=500, 
                detail=f"Error processing agent response: {str(last_error)}"
            )
        
        logger.info(f"Agent responded with: {final_response_text[:100]}...")
        
        # Prepare response object with file acknowledgment
        file_prefix = ""
        if file_id:
            # Extract just the filename from the full file_id
            filename = file_id.split('_')[-1] if '_' in file_id else file_id
            
            # Add a prefix acknowledging the file type
            file_type = "file"
            if file_id and file_part and hasattr(file_part, 'inline_data') and hasattr(file_part.inline_data, 'mime_type'):
                mime_type = file_part.inline_data.mime_type
                if mime_type.startswith('image/'):
                    file_type = "image"
                elif mime_type == 'application/pdf':
                    file_type = "PDF"
                elif mime_type in ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']:
                    file_type = "document"
            
            file_prefix = f"I've received your {file_type} '{filename}'. "
        
        # Return the response with file acknowledgment if needed
        response_object = {
            "response": file_prefix + final_response_text,
            "sessionId": session_id,
            "success": True
        }
        
        # Include file information in the response if a file was used
        if file_id:
            response_object.update({
                "fileId": file_id,
                "fileName": file_id.split('_')[-1] if '_' in file_id else file_id,
                "fileProcessed": True
            })
        
        return JSONResponse(content=response_object)
    except Exception as e:
        logger.error(f"Error in API message endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "success": False}
    )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

@app.get("/api/test-file-to-agent/{artifact_id}")
async def test_file_to_agent(artifact_id: str):
    """Test endpoint to verify that files are properly passed to the agent"""
    try:
        # Create test user and session
        test_user_id = "test_user"
        test_session_id = "test_session"
        
        logger.info(f"Testing file passing to agent with artifact ID: {artifact_id}")
        
        # Ensure session exists
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id
        )
        
        # Load the artifact - CRITICAL FIX: Add await here
        file_part = await artifact_service.load_artifact(
            app_name=APP_NAME,
            user_id=test_user_id, 
            session_id=test_session_id,
            filename=artifact_id
        )
        
        if not file_part:
            return {
                "status": "error",
                "message": f"Could not load artifact with ID: {artifact_id}"
            }
            
        logger.info(f"Successfully loaded test artifact: {file_part}")
        logger.info(f"Artifact type: {type(file_part)}")
        
        # Log the artifact structure
        if hasattr(file_part, 'inline_data'):
            logger.info(f"inline_data type: {type(file_part.inline_data)}")
            if hasattr(file_part.inline_data, 'mime_type'):
                logger.info(f"mime_type: {file_part.inline_data.mime_type}")
            if hasattr(file_part.inline_data, 'data'):
                logger.info(f"data size: {len(file_part.inline_data.data)} bytes")
                
        # Create a message with the file
        parts = [
            types.Part(text="Please analyze this file and tell me about it."),
            file_part
        ]
        
        # Create the content object
        content = types.Content(role='user', parts=parts)
        
        # Send to the agent
        logger.info(f"Sending artifact to agent for test endpoint")
        try:
            final_response = None
            logger.info(f"Starting runner.run_async in test endpoint")
            async_events = runner.run_async(
                user_id=test_user_id, 
                session_id=test_session_id,
                new_message=content
            )
            
            logger.info(f"Processing events from run_async in test endpoint")
            async for event in async_events:
                if event.is_final_response():
                    logger.info(f"Received final response event: {event}")
                    if event.content and event.content.parts:
                        final_response = event.content.parts[0].text
                        logger.info(f"Extracted final response text: {final_response[:100]}...")
                    break
            
            logger.info(f"Finished processing events from run_async")
            
            if final_response:
                logger.info(f"Test successful, agent processed artifact and responded")
                return {
                    "status": "success",
                    "message": "File successfully passed to agent",
                    "agent_response": final_response
                }
            else:
                logger.warning(f"Agent did not produce a response for test artifact")
                return {
                    "status": "error",
                    "message": "Agent did not produce a response"
                }
        except Exception as e:
            logger.error(f"Error in runner.run_async for test endpoint: {e}")
            import traceback
            trace = traceback.format_exc()
            logger.error(f"run_async traceback: {trace}")
            return {
                "status": "error",
                "message": f"Error processing artifact with agent: {str(e)}",
                "traceback": trace
            }
            
    except Exception as e:
        logger.error(f"Error in test-file-to-agent endpoint: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Traceback: {trace}")
        return {
            "status": "error",
            "message": f"Test failed: {str(e)}",
            "traceback": trace
        }

@app.get("/api/test/artifact")
async def test_artifact_service():
    """
    Test endpoint to verify that the artifact service is working correctly.
    This endpoint creates a test artifact, saves it, and then loads it back to verify functionality.
    """
    try:
        # Create test constants
        test_user_id = "test_user"
        test_session_id = "test_session"
        test_filename = "test_artifact.txt"
        test_content = b"This is a test artifact created by the test endpoint."
        test_mime_type = "text/plain"
        
        logger.info(f"Testing artifact service with simple text artifact")
        
        # Create a new session if needed
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id
        )
        
        # Create an artifact using Google ADK's format
        blob = types.Blob(
            mime_type=test_mime_type,
            data=test_content
        )
        artifact = types.Part(inline_data=blob)
        
        # Save the artifact
        logger.info(f"Saving test artifact: {test_filename}")
        await artifact_service.save_artifact(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id,
            filename=test_filename,
            artifact=artifact
        )
        
        # Load the artifact back - CRITICAL FIX: Add await here
        logger.info(f"Loading test artifact: {test_filename}")
        loaded_artifact = await artifact_service.load_artifact(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id,
            filename=test_filename
        )
        
        # Verify the artifact was loaded correctly
        if not loaded_artifact:
            logger.error("Failed to load test artifact")
            return {
                "success": False,
                "error": "Failed to load artifact after saving"
            }
        
        # Check that the loaded artifact has the correct structure
        if not hasattr(loaded_artifact, 'inline_data'):
            logger.error("Loaded artifact missing inline_data attribute")
            return {
                "success": False,
                "error": "Loaded artifact has incorrect structure - missing inline_data"
            }
        
        # Check mime type
        loaded_mime_type = getattr(loaded_artifact.inline_data, 'mime_type', None)
        if loaded_mime_type != test_mime_type:
            logger.error(f"Mime type mismatch: {loaded_mime_type} != {test_mime_type}")
            return {
                "success": False,
                "error": f"Mime type mismatch: {loaded_mime_type} != {test_mime_type}"
            }
        
        # Check data
        loaded_data = getattr(loaded_artifact.inline_data, 'data', None)
        if loaded_data != test_content:
            logger.error(f"Data mismatch: {loaded_data} != {test_content}")
            return {
                "success": False,
                "error": "Data content mismatch"
            }
        
        # If we got here, the test was successful
        logger.info("Artifact service test successful")
        return {
            "success": True,
            "message": "Artifact service is working correctly",
            "artifact": {
                "filename": test_filename,
                "mime_type": test_mime_type,
                "content_size": len(test_content),
                "loaded_size": len(loaded_data) if loaded_data else 0
            }
        }
    except Exception as e:
        logger.error(f"Error in artifact service test: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Traceback: {trace}")
        return {
            "success": False,
            "error": str(e),
            "traceback": trace
        }

@app.get("/api/test/await-artifacts")
async def test_await_artifacts():
    """
    Special test endpoint to verify that all artifact operations are properly awaited.
    This endpoint tests save and load operations in sequence with detailed logging.
    """
    try:
        logger.info("Starting await-artifacts test")
        
        # Create test constants
        test_user_id = "test_user"
        test_session_id = "test_session"
        test_filename = f"await_test_{uuid.uuid4().hex}.txt"
        test_content = b"This is a test artifact for verifying await operations."
        test_mime_type = "text/plain"
        
        logger.info(f"Testing artifact service await operations with: {test_filename}")
        
        # Create a new session
        session = session_service.create_session(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id
        )
        logger.info(f"Created test session for await test: {test_session_id}")
        
        # Create an artifact
        blob = types.Blob(
            mime_type=test_mime_type,
            data=test_content
        )
        artifact = types.Part(inline_data=blob)
        logger.info(f"Created test artifact object for await test")
        
        # Test 1: Save artifact with await
        logger.info(f"TEST 1: Saving artifact with await: {test_filename}")
        save_start_time = datetime.datetime.now()
        save_version = await artifact_service.save_artifact(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id,
            filename=test_filename,
            artifact=artifact
        )
        save_end_time = datetime.datetime.now()
        save_duration = (save_end_time - save_start_time).total_seconds()
        logger.info(f"Await save completed in {save_duration:.6f}s with version: {save_version}")
        
        # Test 2: Load artifact with await
        logger.info(f"TEST 2: Loading artifact with await: {test_filename}")
        load_start_time = datetime.datetime.now()
        loaded_artifact = await artifact_service.load_artifact(
            app_name=APP_NAME,
            user_id=test_user_id,
            session_id=test_session_id,
            filename=test_filename
        )
        load_end_time = datetime.datetime.now()
        load_duration = (load_end_time - load_start_time).total_seconds()
        logger.info(f"Await load completed in {load_duration:.6f}s")
        
        # Verify loaded artifact
        if not loaded_artifact:
            raise ValueError("Failed to load artifact during await test")
        
        if not hasattr(loaded_artifact, 'inline_data'):
            raise ValueError("Loaded artifact missing inline_data attribute during await test")
        
        # Verify content
        loaded_mime_type = getattr(loaded_artifact.inline_data, 'mime_type', None)
        loaded_data = getattr(loaded_artifact.inline_data, 'data', None)
        
        if loaded_mime_type != test_mime_type:
            raise ValueError(f"Mime type mismatch: {loaded_mime_type} != {test_mime_type}")
        
        if loaded_data != test_content:
            raise ValueError(f"Data content mismatch: {len(loaded_data)} bytes != {len(test_content)} bytes")
        
        logger.info("Await artifact tests passed successfully!")
        return {
            "success": True,
            "message": "All artifact await operations completed successfully",
            "tests": {
                "save": {
                    "duration_seconds": save_duration,
                    "version": save_version
                },
                "load": {
                    "duration_seconds": load_duration,
                    "content_size": len(loaded_data) if loaded_data else 0
                }
            }
        }
    except Exception as e:
        logger.error(f"Error in await artifacts test: {e}")
        import traceback
        trace = traceback.format_exc()
        logger.error(f"Await test traceback: {trace}")
        return {
            "success": False,
            "error": str(e),
            "traceback": trace
        }

# Add this at the bottom of the file to catch any coroutine related errors
async def handle_coroutine_errors():
    """
    Global error handler to help catch and log any uncaught coroutine errors.
    """
    loop = asyncio.get_event_loop()
    
    def exception_handler(loop, context):
        exception = context.get('exception')
        logger.error(f"Unhandled asyncio exception: {context.get('message')}")
        if exception:
            logger.error(f"Exception details: {exception}")
            if isinstance(exception, RuntimeError) and 'coroutine was never awaited' in str(exception):
                logger.error("This is a coroutine awaiting error. Make sure all async functions are properly awaited.")
            import traceback
            if hasattr(exception, '__traceback__'):
                logger.error(f"Traceback: {''.join(traceback.format_tb(exception.__traceback__))}")
    
    loop.set_exception_handler(exception_handler)
    
    # Also set up a general task exception handler
    def log_task_exception(task):
        try:
            exception = task.exception()
            if exception:
                logger.error(f"Unhandled task exception: {exception}")
                import traceback
                if hasattr(exception, '__traceback__'):
                    logger.error(f"Traceback: {''.join(traceback.format_tb(exception.__traceback__))}")
        except asyncio.CancelledError:
            pass
    
    # Monitor all tasks created after this point
    for task in asyncio.all_tasks():
        task.add_done_callback(log_task_exception)

# Setup the error handler when the app starts
@app.on_event("startup")
async def startup_event():
    await handle_coroutine_errors()
    logger.info("API server started with coroutine error handling enabled")

if __name__ == "__main__":
    import uvicorn
    
    # Log all registered routes for debugging
    logger.info("FastAPI registered routes:")
    for route in app.routes:
        if hasattr(route, "methods"):
            logger.info(f"Route: {route.path}, Methods: {route.methods}")
        else:
            logger.info(f"Route: {route.path}, Type: WebSocket")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)