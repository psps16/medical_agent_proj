# Medical Agent Project

## Project Description

This project implements a medical agent system with a FastAPI backend and a React frontend. The agent is built using the Google ADK (Agent Development Kit) and is designed to assist with medical-related queries, appointment booking, and medicine information. It utilizes various tools, including Google Search, and interacts with a Firestore database for data persistence.

The system consists of:
- **Backend (`api_server.py`, `main.py`):** A FastAPI application that serves the API endpoints for the frontend to interact with the medical agent. It handles user messages, file uploads, and manages agent sessions.
- **Medical Agent (`medical_agent/`):** Contains the core logic of the agent, including different specialized sub-agents for tasks like search, appointment booking, and medical store interactions. It uses Google's Generative AI models.
- **Frontend (`frontend/`):** A React application (built with Vite and TypeScript) that provides the user interface for interacting with the medical agent.
- **Utilities (`medical_agent/utils/`):** Helper modules for various functionalities like appointment management, database interactions, report generation, and Firebase configuration.

## Requirements

### Backend (Python)

- Python 3.x
- The dependencies are listed in `requirements.txt`. Key dependencies include:
  - `google-adk`
  - `fastapi`
  - `uvicorn`
  - `google-generativeai`
  - `firebase-admin`
  - `python-docx`
  - `python-multipart`

### Frontend (Node.js/React)

- Node.js (version specified by Vite/React compatibility, typically latest LTS)
- npm or yarn
- The dependencies are listed in `frontend/package.json`. Key dependencies include:
  - `react`
  - `react-dom`
  - `vite`
  - `typescript`
  - `firebase` (for client-side Firebase interaction)
  - `@fullcalendar/react` (for calendar functionalities)

## Setup and Running the Project

### 1. Backend Setup

   a. **Clone the repository (if not already done).**

   b. **Navigate to the project root directory:**
      ```bash
      cd medical_agent_proj1
      ```

   c. **Create and activate a virtual environment (recommended):**
      ```bash
      python -m venv venv
      # On Windows
      .\venv\Scripts\activate
      # On macOS/Linux
      source venv/bin/activate
      ```

   d. **Install Python dependencies:**
      ```bash
      pip install -r requirements.txt
      ```

   e. **Set up Firebase:**
      - Ensure you have a Firebase project set up.
      - Download your Firebase Admin SDK service account key (a JSON file) and place it in a secure location.
      - Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of this JSON file.
      - Configure Firebase settings in `medical_agent/utils/firebase_config.py` if necessary (though often environment variables are preferred for credentials).

   f. **Set up Environment Variables:**
      - Create a `.env` file in the project root directory.
      - Add necessary environment variables, for example:
        ```env
        OPENROUTER_API_BASE=your_openrouter_api_base_url
        GOOGLE_API_KEY=your_google_api_key 
        # Add other necessary API keys or configurations
        ```
      The `medical_agent/agent.py` file loads environment variables using `dotenv`.

### 2. Frontend Setup

   a. **Navigate to the frontend directory:**
      ```bash
      cd frontend
      ```

   b. **Install Node.js dependencies:**
      ```bash
      npm install
      # or
      yarn install
      ```
   c. **Configure Firebase for the frontend:**
      - In `frontend/src/firebase/firebaseConfig.ts` (or a similar file), configure your Firebase project details (apiKey, authDomain, projectId, etc.) for the client-side SDK.

### 3. Running the Application

   a. **Start the Backend (FastAPI server):**
      - From the project root directory (`medical_agent_proj1`):
      ```bash
      uvicorn api_server:app --reload --host 0.0.0.0 --port 8000
      ```
      This will start the FastAPI server, typically on `http://localhost:8000`.

   b. **Start the Frontend (React development server):**
      - Open a new terminal.
      - Navigate to the `frontend` directory:
      ```bash
      cd frontend
      ```
      - Start the Vite development server:
      ```bash
      npm run dev
      # or
      yarn dev
      ```
      This will usually start the frontend application on `http://localhost:5173` (the port may vary, check the terminal output).

   c. **Access the application:**
      - Open your web browser and navigate to the frontend URL (e.g., `http://localhost:5173`).

### Alternative: Running the Command-Line Interface (CLI)

The project also includes `main.py`, which provides a command-line interface to interact with the medical agent directly without the web UI.

   a. **Ensure backend dependencies are installed and environment variables are set** (as per Backend Setup steps).
   b. **Navigate to the project root directory.**
   c. **Run the CLI:**
      ```bash
      python main.py
      ```
      You can then type your queries directly into the terminal.

## Project Structure

```
├── .gitignore
├── README.md
├── api_server.py         # FastAPI backend server
├── frontend/             # React frontend application
│   ├── package.json
│   ├── src/              # Frontend source code
│   └── ...
├── main.py               # CLI for interacting with the agent
├── medical_agent/        # Core agent logic
│   ├── __init__.py
│   ├── agent.py          # Agent definitions (root and sub-agents)
│   ├── database/         # Data files (e.g., medicines.json)
│   │   └── medicines.json
│   ├── docx/             # Example .docx files for report generation
│   └── utils/            # Utility modules
│       ├── appointment.py
│       ├── appointment_tool.py
│       ├── database_utils.py
│       ├── firebase_config.py
│       ├── instructions.py
│       ├── medicine_tool.py
│       ├── migrate_doctors.py
│       ├── report_tool.py
│       └── setup_firestore.py
├── package.json          # (Likely a placeholder or for root-level scripts, primary frontend is in frontend/)
└── requirements.txt      # Python dependencies
```

## Key Features

- **Conversational AI with Google ADK:** The core of the agent system is built using the Google Agent Development Kit (ADK). This framework facilitates:
    - **Agent Definition:** Defining agents (e.g., `root_agent`, `search_agent`, `appointment_agent`, `medical_store_agent` in `medical_agent/agent.py`) with specific instructions, Large Language Models (LLMs like Gemini), and tools.
    - **Tool Integration:** Seamlessly integrating pre-built tools (like `google_search`) and custom-developed tools (e.g., `AppointmentTool`, `MedicineTool`, `ReportToolDocx`). Tools are defined and made available to agents to perform specific actions.
    - **Session Management:** The ADK's `InMemorySessionService` (as seen in `api_server.py` and `main.py`) is used to manage conversation states and user sessions.
    - **Artifact Handling:** The `InMemoryArtifactService` helps in managing data artifacts that might be exchanged during agent interactions (e.g., uploaded files for analysis).
    - **Runner Logic:** The `Runner` class from ADK (`google.adk.runners.Runner`) is used to execute agent logic, process user messages, and stream agent responses (as demonstrated in `api_server.py` for WebSocket communication and `main.py` for the CLI).
    - **Sub-Agent Orchestration:** The ADK allows for a hierarchical agent structure. The `root_agent` can delegate tasks to specialized `sub_agents` (like `appointment_agent` and `medical_store_agent`), each equipped with relevant tools and instructions for their domain.
- **Modular Agent Design:** Employs a `root_agent` that acts as an orchestrator, delegating tasks to specialized sub-agents (`search_agent`, `appointment_agent`, `medical_store_agent`). This promotes separation of concerns and makes the system more maintainable and extensible.
- **Tool Usage:** Integrates a variety of tools:
    - Standard tools like `google_search` provided by ADK.
    - Custom tools developed for specific medical domain tasks: `ReportToolDocx` for generating reports, `AppointmentTool` for managing doctor appointments, and `MedicineTool` for handling medicine-related queries and actions.
- **Web Interface:** Provides a user-friendly React-based frontend for interaction, communicating with the backend via WebSockets and HTTP requests.
- **API Backend:** A robust FastAPI server handles incoming user requests, manages WebSocket connections for real-time communication with the agent, processes file uploads, and orchestrates the agent's responses.
- **File Handling:** Supports file uploads through the API. The `api_server.py` includes logic to create ADK-compatible artifacts from uploaded files, which can then be potentially used by agents (e.g., a report to be summarized or analyzed).
- **Database Integration:** Uses Firebase Firestore for data persistence, likely for storing user information, appointment details, medication records, etc. (managed via `database_utils.py` and `firebase_config.py`).
- **Report Generation:** Capable of generating DOCX reports using the `ReportToolDocx`.

## Agentic Architecture and Workflow

The system follows a hierarchical and tool-augmented agent architecture:

1.  **User Interaction:**
    *   The user interacts with the system either through the React frontend or the command-line interface (`main.py`).
    *   Messages from the frontend are sent to the FastAPI backend (`api_server.py`) via WebSocket or HTTP.

2.  **Request Handling (FastAPI Backend):**
    *   The `api_server.py` receives the user's query.
    *   A unique session is maintained for the user using `InMemorySessionService` from Google ADK.
    *   If files are uploaded, they are processed into ADK `Artifact` format using `InMemoryArtifactService`.

3.  **Root Agent Orchestration (`medical_agent/agent.py`):
    *   The user's query (and any associated artifacts) is passed to the `root_agent` via the ADK `Runner`.
    *   The `root_agent`, based on its instructions (`Instructions.ORCHESTRATOR`), determines the nature of the request.
    *   It can use its own tools directly (e.g., `ReportToolDocx` or `AgentTool(agent=search_agent)` for general searches).
    *   If the request pertains to a specialized domain, the `root_agent` delegates the task to one of its `sub_agents`:
        *   **`appointment_agent`**: Handles queries related to booking appointments, finding doctor details. It has access to `AppointmentTool` and can also use the `search_agent` for related information.
        *   **`medical_store_agent`**: Manages queries about medicines, prescriptions, purchases, and inquiries. It uses various methods from `MedicineTool`.
        *   **`search_agent`**: A general-purpose agent equipped with `google_search` to find information on the web. It can be invoked by the `root_agent` or other sub-agents.

4.  **Tool Execution:**
    *   The selected agent (root or sub-agent) identifies the appropriate tool(s) to fulfill the request based on its instructions and the user's query.
    *   The tool is executed (e.g., `AppointmentTool.book_doctor_appointment_tool`, `MedicineTool.get_medicines_tool`, `google_search`).
    *   Tools might interact with external services (Google Search), databases (Firestore via `database_utils.py`), or perform internal logic (generating a DOCX report).

5.  **Response Generation:**
    *   The LLM associated with the active agent generates a response based on the tool's output and its instructions.
    *   The ADK `Runner` streams these events (including partial responses, tool calls, and final responses).

6.  **Response Delivery:**
    *   The `api_server.py` forwards the agent's response back to the frontend via WebSocket or as an HTTP response.
    *   The CLI (`main.py`) prints the response directly to the console.

**Visual Workflow (Simplified):**

![Agent Workflow Diagram](./agenticflow.png)

## To-Do / Potential Enhancements

- Detailed error handling and logging.
- More robust security measures, especially for API keys and sensitive data.
- Comprehensive unit and integration tests.
- Scalability improvements for handling a large number of users.
- Enhanced UI/UX for the frontend application.
- Clearer definition and usage of the root-level `package.json` if it's intended for more than just a placeholder.