from google.genai import types
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.runners import Runner
import asyncio

# Import the agent definitions from the medical_agent module
from medical_agent.agent import root_agent

# Set up session service and artifact service
session_service = InMemorySessionService()
artifact_service = InMemoryArtifactService()  # Initialize artifact service

# Define application constants
APP_NAME = "medical_agent"
USER_ID = "user_1"
SESSION_ID = "session_001"

# Create a session
session = session_service.create_session(
    app_name=APP_NAME,
    user_id=USER_ID,
    session_id=SESSION_ID   
)

# Initialize the runner with our root agent and artifact service
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service,
    artifact_service=artifact_service  # Add artifact service to runner
)

async def call_agent_async(query: str, runner, user_id, session_id):
    """Send a query to the agent and process the response."""
    print(f"\n >>> User query: {query}")

    # Create content object from user query
    content = types.Content(role='user', parts=[types.Part(text=query)])
    final_response_text = "Agent did not produce a final response"

    # Process agent response events
    async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=content):
        if event.is_final_response():
            if event.content and event.content.parts:
                final_response_text = event.content.parts[0].text
            elif event.actions and event.actions.escalate:
                final_response_text = f"Agent escalated: {event.error_message or 'No specific message'}"
            break
    
    print(f"\n <<< Agent response: {final_response_text}")
    return final_response_text

async def run_conversation():
    """Run an interactive conversation with the medical agent."""
    print("\n=== Medical Agent Conversation ===\n")
    print("Type 'exit' to end the conversation.\n")
    
    while True:
        user_input = input("Type your query: ")
        
        if user_input.lower() in ['exit', 'quit', 'bye']:
            print("\nEnding conversation. Goodbye!")
            break
            
        await call_agent_async(
            user_input,
            runner=runner,
            user_id=USER_ID,
            session_id=SESSION_ID
        )
        print("\n---")

if __name__ == "__main__":
    try:
        asyncio.run(run_conversation())
    except Exception as e:
        print(f"Error: {e}")