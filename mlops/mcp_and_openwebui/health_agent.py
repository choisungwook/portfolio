import logging
from strands import Agent
from strands.models.openai import OpenAIModel
from strands.tools.mcp import MCPClient
from mcp.client.streamable_http import streamablehttp_client

# Configure logging for debug information
logging.getLogger("strands").setLevel(logging.INFO)
logging.basicConfig(
    format="%(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler()]
)

# Configure the OpenAI model to connect to local Qwen3-8B server
openai_model = OpenAIModel(
    client_args={
        "base_url": "http://localhost:4000/v1",  # Local server endpoint
        "api_key": "your-secret-key"  # Required but can be dummy for local servers
    },
    model_id="llam3.1-8B",  # Model identifier
    temperature=0.3,  # Lower temperature for more consistent medical advice
    max_tokens=2048
)

def create_health_agent():
    """Create the health agent with MCP healthcare data server connection via streamable HTTP"""

    # Connect to the MCP healthcare server using streamable HTTP client
    mcp_client = MCPClient(lambda: streamablehttp_client("http://localhost:8000/mcp"))

    # Get tools from the MCP server
    with mcp_client:
        tools = mcp_client.list_tools_sync()

        # Create the health agent with MCP tools
        health_agent = Agent(
            model=openai_model,
            tools=tools,  # Use the MCP server tools
            system_prompt="""You are a Clinical Decision Support AI Assistant with access to patient data through an MCP healthcare data server. You help healthcare professionals with diagnostic reasoning and clinical decision-making.

Your role is to:
- Provide evidence-based clinical insights and differential diagnoses
- Assist with symptom analysis and pattern recognition using patient data
- Offer treatment recommendations based on current medical guidelines and patient history
- Help interpret clinical findings and laboratory results
- Support clinical reasoning with relevant medical knowledge and patient-specific data
- Retrieve and analyze patient histories, lab results, and demographic information

Available Healthcare Data Tools (via MCP server at http://localhost:8000):
- get_patient_info: Retrieve patient demographics (use patient IDs: PAT001, PAT002, PAT003)
- get_patient_history: Get complete medical history including conditions and diagnoses
- get_lab_results: Retrieve lab results within specified timeframes
- search_patients: Find patients by name or ID
- get_patient_summary: Get comprehensive patient overview with risk assessment

Important Guidelines:
- Always emphasize that your recommendations are for clinical decision support only
- Remind users that final diagnostic and treatment decisions must be made by qualified healthcare professionals
- Base recommendations on established medical guidelines and evidence-based practices
- Consider patient safety as the highest priority
- Use the MCP healthcare data tools to provide personalized clinical insights
- Acknowledge limitations and recommend specialist consultation when appropriate
- Maintain patient confidentiality and HIPAA compliance principles

You should provide structured, clear responses that include:
1. Clinical assessment of presented information
2. Patient-specific data analysis when relevant (using MCP tools)
3. Differential diagnosis considerations
4. Recommended diagnostic workup or tests
5. Treatment considerations based on patient history
6. Recommmended medication
7. Red flags or urgent concerns to monitor

Remember: You are a support tool for healthcare professionals, not a replacement for clinical judgment. Use the MCP healthcare data server tools to access patient information when needed."""
        )

        return health_agent, mcp_client

def main():
    """Main function to run the health agent interactively"""
    print("🏥 Clinical Decision Support Agent with MCP Healthcare Data Server")
    print("=" * 65)
    print("Connecting to MCP Healthcare Data Server at http://localhost:8000...")

    try:
        # Create the health agent with MCP connection
        health_agent, mcp_client = create_health_agent()

        print("✅ Successfully connected to MCP Healthcare Data Server via streamable HTTP!")
        print("This agent assists healthcare professionals with clinical decision-making.")
        print("Available sample patients: PAT001 (John Doe), PAT002 (Jane Smith), PAT003 (Robert Johnson)")
        print("Type 'quit' to exit.\n")

        # Show example queries
        print("Example queries:")
        print("- 'Get patient summary for PAT001'")
        print("- 'Show lab results for John Doe in the last 30 days'")
        print("- 'What are the risk factors for patient PAT003?'")
        print("- 'Search for patients with diabetes'")
        print("- 'Analyze the lab trends for PAT001'")
        print("-" * 65)

        # Keep the MCP client connection alive during the session
        with mcp_client:
            while True:
                try:
                    # Get user input
                    user_input = input("\nDoctor: ").strip()

                    if user_input.lower() in ['quit', 'exit', 'q']:
                        print("Thank you for using the Clinical Decision Support Agent. Stay safe!")
                        break

                    if not user_input:
                        continue

                    # Process the query with the health agent
                    # The agent will automatically use MCP tools when needed
                    print("\n🤖 Clinical Assistant:")
                    response = health_agent(user_input)
                    print(f"{response.message}\n")
                    print("-" * 65)

                except KeyboardInterrupt:
                    print("\n\nGoodbye!")
                    break
                except Exception as e:
                    print(f"Error processing request: {e}")
                    print("Please try again or type 'quit' to exit.\n")

    except Exception as e:
        print(f"❌ Failed to connect to MCP Healthcare Data Server: {e}")
        print("Please ensure the MCP server is running at http://localhost:8000")
        print("Start the MCP server with: python mcpserver.py")

if __name__ == "__main__":
    main()
