// EC2 Manager Lambda Function with Countdown Support
// For use with Self-Shutdown EC2 monitoring

import { EC2Client, StartInstancesCommand, StopInstancesCommand, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

// Initialize clients
const ec2Client = new EC2Client();
const ssmClient = new SSMClient();

// Configuration - read from environment variables
const INSTANCE_ID = process.env.INSTANCE_ID;
const APP_PORT = process.env.APP_PORT || '8069';
const INACTIVITY_MINUTES = parseInt(process.env.INACTIVITY_MINUTES || '30');

export const handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));
  
  // Set CORS headers for all responses
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Handle OPTIONS requests for CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  try {
    // Handle HTTP requests from web UI
    if (event.requestContext?.http) {
      const method = event.requestContext.http.method;
      
      // GET request - retrieve instance status
      if (method === 'GET') {
        return await getInstanceStatus(headers);
      }
      
      // POST request - start or stop instance
      if (method === 'POST') {
        let body;
        try {
          body = JSON.parse(event.body || '{}');
        } catch (error) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ 
              error: 'Invalid request body', 
              message: 'Could not parse JSON' 
            })
          };
        }
        
        const action = body.action;
        
        if (action === 'start') {
          return await startInstance(headers);
        }
        
        if (action === 'stop') {
          return await stopInstance(headers);
        }
        
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Invalid action', 
            message: 'Use "start" or "stop"' 
          })
        };
      }
    }
    
    // Unknown event type
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ 
        error: 'Invalid request', 
        message: 'Unrecognized event type' 
      })
    };
    
  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server error', 
        message: error.message
      })
    };
  }
};

// Check instance state
async function checkInstanceState() {
  const command = new DescribeInstancesCommand({
    InstanceIds: [INSTANCE_ID]
  });
  
  const result = await ec2Client.send(command);
  
  if (!result.Reservations || result.Reservations.length === 0 || 
      !result.Reservations[0].Instances || result.Reservations[0].Instances.length === 0) {
    throw new Error(`Instance ${INSTANCE_ID} not found`);
  }
  
  return result.Reservations[0].Instances[0].State.Name;
}

// Get countdown time from instance
async function getCountdownFromInstance() {
  try {
    const command = new SendCommandCommand({
      DocumentName: "AWS-RunShellScript",
      InstanceIds: [INSTANCE_ID],
      Parameters: {
        commands: [
          "cat /home/ec2-user/shutdown_status.json"
        ]
      }
    });
    
    const response = await ssmClient.send(command);
    const commandId = response.CommandId;
    
    // Wait for command to complete (retry a few times)
    let output = null;
    let attempts = 0;
    
    while (!output && attempts < 3) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        const result = await ssmClient.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: INSTANCE_ID
        }));
        
        if (result.Status === 'Success' && result.StandardOutputContent) {
          output = result.StandardOutputContent;
        }
      } catch (error) {
        console.log(`Attempt ${attempts + 1} failed:`, error.message);
      }
      
      attempts++;
    }
    
    if (!output) {
      console.log("Could not get shutdown status");
      return { remainingMinutes: null };
    }
    
    try {
      const statusData = JSON.parse(output.trim());
      return { 
        remainingMinutes: statusData.remainingMinutes,
        lastActivity: statusData.lastActivity,
        shuttingDown: statusData.shuttingDown
      };
    } catch (error) {
      console.log("Error parsing shutdown status:", error);
      return { remainingMinutes: null };
    }
  } catch (error) {
    console.log("Error getting countdown:", error);
    return { remainingMinutes: null };
  }
}

// Get instance status 
async function getInstanceStatus(headers) {
  try {
    const command = new DescribeInstancesCommand({
      InstanceIds: [INSTANCE_ID]
    });
    
    const result = await ec2Client.send(command);
    
    if (!result.Reservations || result.Reservations.length === 0 || 
        !result.Reservations[0].Instances || result.Reservations[0].Instances.length === 0) {
      throw new Error(`Instance ${INSTANCE_ID} not found`);
    }
    
    const instance = result.Reservations[0].Instances[0];
    const status = instance.State.Name;
    const publicIp = instance.PublicIpAddress || null;
    
    // Get countdown info if the instance is running
    let remainingMinutes = null;
    let lastActivity = null;
    let shuttingDown = false;
    
    if (status === 'running' && publicIp) {
      try {
        const countdownInfo = await getCountdownFromInstance();
        remainingMinutes = countdownInfo.remainingMinutes;
        lastActivity = countdownInfo.lastActivity;
        shuttingDown = countdownInfo.shuttingDown || false;
      } catch (error) {
        console.log("Error getting countdown:", error);
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        instanceId: INSTANCE_ID,
        status,
        publicIp,
        appPort: APP_PORT,
        inactivityShutdown: true,
        inactivityThreshold: INACTIVITY_MINUTES,
        remainingMinutes,
        lastActivity,
        shuttingDown
      })
    };
  } catch (error) {
    console.error('Error getting instance status:', error);
    throw error;
  }
}

// Start instance
async function startInstance(headers) {
  // First check if instance is already running
  const currentState = await checkInstanceState();
  
  // If instance is already running, just return the status
  if (currentState === 'running') {
    return await getInstanceStatus(headers);
  }
  
  // If instance is in a transition state, return the current state
  if (currentState === 'pending') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        instanceId: INSTANCE_ID,
        status: 'pending',
        message: 'Instance is already starting. Please wait and refresh.',
        appPort: APP_PORT
      })
    };
  }
  
  if (currentState === 'stopping') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        instanceId: INSTANCE_ID,
        status: 'stopping',
        message: 'Instance is stopping. Please wait until it\'s stopped before starting it again.',
        appPort: APP_PORT
      })
    };
  }
  
  // Start the instance
  console.log(`Starting instance ${INSTANCE_ID}`);
  const startCommand = new StartInstancesCommand({
    InstanceIds: [INSTANCE_ID]
  });
  
  await ec2Client.send(startCommand);
  
  // Wait for the instance to get an IP (max 15 seconds)
  let publicIp = null;
  let status = 'pending';
  let attempts = 0;
  
  while ((!publicIp || status !== 'running') && attempts < 3) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const checkCommand = new DescribeInstancesCommand({
      InstanceIds: [INSTANCE_ID]
    });
    
    const result = await ec2Client.send(checkCommand);
    
    const instance = result.Reservations[0].Instances[0];
    status = instance.State.Name;
    publicIp = instance.PublicIpAddress;
    
    attempts++;
  }
  
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      instanceId: INSTANCE_ID,
      status: status,
      publicIp,
      message: publicIp ? 
        'Instance started successfully. Odoo is initializing and will be available in a minute.' : 
        'Instance is starting. Refresh in a moment to get the IP address.',
      appPort: APP_PORT
    })
  };
}

// Stop instance
async function stopInstance(headers) {
  // Check current state
  const currentState = await checkInstanceState();
  
  // If instance is already stopped or stopping, just return the status
  if (currentState === 'stopped') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        instanceId: INSTANCE_ID,
        status: 'stopped',
        message: 'Instance is already stopped'
      })
    };
  }
  
  if (currentState === 'stopping') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        instanceId: INSTANCE_ID,
        status: 'stopping',
        message: 'Instance is already stopping'
      })
    };
  }
  
  // Trigger the shutdown script via SSM before stopping the instance
  try {
    console.log("Executing Odoo shutdown script...");
    const ssmCommand = new SendCommandCommand({
      DocumentName: "AWS-RunShellScript",
      InstanceIds: [INSTANCE_ID],
      Parameters: {
        commands: [
          "sudo systemctl stop odoo-docker"
        ],
        executionTimeout: ["60"] // 1 minute timeout
      }
    });
    
    await ssmClient.send(ssmCommand);
    console.log("Shutdown script executed successfully");
  } catch (error) {
    console.log("Warning: Could not execute shutdown script:", error.message);
  }
  
  // Stop the instance
  console.log(`Stopping instance ${INSTANCE_ID}`);
  const stopCommand = new StopInstancesCommand({
    InstanceIds: [INSTANCE_ID]
  });
  
  await ec2Client.send(stopCommand);
  
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      instanceId: INSTANCE_ID,
      status: 'stopping',
      message: 'Instance stopping.'
    })
  };
}