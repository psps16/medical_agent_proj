from google.adk.agents import Agent
from medical_agent.utils.report_tool import ReportToolDocx
from google.adk.tools import google_search
from google.adk.tools.agent_tool import AgentTool
from medical_agent.utils.appointment_tool import AppointmentTool
from medical_agent.utils.instructions import Instructions
from medical_agent.utils.medicine_tool import MedicineTool
from dotenv import load_dotenv
import os

load_dotenv()
os.environ["OPENROUTER_API_BASE"]

root_agent_instruction = Instructions.ORCHESTRATOR
booking_agent_instruction=Instructions.APPOINTMENT
medical_store_agent_instruction=Instructions.MEDICAL_STORE

search_agent = Agent(
    name="search_agent",
    model="gemini-2.0-flash-lite",
    instruction=
    """
    you are a search agent, you have google_search tool to search the web. 
    """,
    tools=[google_search],
)

appointment_agent=Agent(
    name="appointment_agent",
    model="gemini-2.5-flash-preview-04-17",
    instruction=booking_agent_instruction,
    tools=[
        AppointmentTool.book_doctor_appointment_tool,
        AppointmentTool.get_doctor_details_tool,
        AgentTool(agent=search_agent)
    ]
)



medical_store_agent=Agent(
    name="medical_store_agent",
    model="gemini-2.5-flash-preview-04-17",
    instruction=medical_store_agent_instruction,
    tools=[
        MedicineTool.get_medicines_tool,
        MedicineTool.prescribe_medication_tool,
        MedicineTool.get_patient_medications_tool,
        MedicineTool.update_medication_status_tool,
        MedicineTool.get_medicines_by_symptom_tool,
        MedicineTool.purchase_medicine_tool,
        MedicineTool.get_patient_purchased_medicines_tool,
        MedicineTool.get_medicine_quantity_tool,
        MedicineTool.record_medicine_inquiry_tool,
        MedicineTool.get_patient_medicine_inquiries_tool,
        MedicineTool.get_medications_counter_tool
    ]
)






root_agent=Agent(
    name="medical_agent",
    model="gemini-2.5-flash-preview-04-17",
    instruction=root_agent_instruction,
    tools=[ReportToolDocx.make_report_docx,AgentTool(agent=search_agent)],
    sub_agents=[appointment_agent,medical_store_agent]
)




'''
session_service=InMemorySessionService()

APP_NAME = "medical_agent"
USER_ID = "user_1"
SESSION_ID = "session_001"


session = session_service.create_session(
    app_name=APP_NAME,
    user_id=USER_ID,
    session_id=SESSION_ID   
)

runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service
)

async def call_agent_async(query:str,runner,user_id,session_id):
    print(f"\n >>> user query:{query}")

    content = types.Content(role='user',parts =[types.Part(text=query)])
    final_response_text = "Agent did not produce a final response"

    async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=content):
        if event.is_final_response():
            if event.content and event.content.parts:
                final_response_text=event.content.parts[0].text
            elif event.actions and event.actions.escalate:
                final_response_text = f"Agent escalated :{event.error_message or 'No specific message'}"
            break
    print(f"\n <<< Agent response: {final_response_text}")

async def run_conversation():
    user_input=input("type you query:")
    await call_agent_async(user_input,
    runner=runner,
    user_id=USER_ID,
    session_id=SESSION_ID
    )

if __name__ == "__main__":
    try:
        asyncio.run(run_conversation())
    except Exception as e:
        print(f"Error: {e}")
'''