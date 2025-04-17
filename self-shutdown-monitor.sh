#!/bin/bash
# Purpose: Monitor Odoo activity and shut down the instance when inactive for 30 minutes
# Enhanced with improved error handling and lock file mechanism

# Configuration
INACTIVITY_THRESHOLD_MINUTES=30
CHECK_INTERVAL_SECONDS=60
LOG_FILE="$HOME/self-shutdown.log"
LOCK_FILE="/tmp/self-shutdown-monitor.lock"
WARNING_MINUTES=5  # Time before shutdown to show warning in UI

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

# Function to clean up on exit
cleanup() {
    log "Monitoring service stopping. Removing lock file."
    rm -f $LOCK_FILE
    exit 0
}

# Handle termination signals
trap cleanup SIGINT SIGTERM EXIT

# Check if another instance is running
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat $LOCK_FILE)
    if ps -p $PID > /dev/null 2>&1; then
        log "Another monitoring process (PID: $PID) is already running. Exiting."
        exit 1
    else
        log "Stale lock file found. Previous process must have crashed."
        rm -f $LOCK_FILE
    fi
fi

# Create lock file
echo $$ > $LOCK_FILE
log "Starting self-shutdown monitoring service with PID $$..."

# Validate AWS CLI is installed
if ! command -v aws &> /dev/null; then
    log "ERROR: AWS CLI is not installed. Cannot continue."
    exit 1
fi

# Get instance metadata with retry
get_instance_metadata() {
    local MAX_RETRIES=3
    local RETRY_COUNT=0
    local ENDPOINT=$1
    local RESULT=""
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        RESULT=$(curl -s --connect-timeout 5 --max-time 10 "http://169.254.169.254/latest/meta-data/$ENDPOINT")
        if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
            echo "$RESULT"
            return 0
        fi
        
        RETRY_COUNT=$((RETRY_COUNT + 1))
        log "Failed to get metadata for $ENDPOINT. Retrying in 2 seconds... (Attempt $RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    done
    
    log "ERROR: Failed to retrieve instance metadata for $ENDPOINT after $MAX_RETRIES attempts"
    return 1
}

# Get instance metadata
INSTANCE_ID=$(get_instance_metadata "instance-id")
if [ $? -ne 0 ] || [ -z "$INSTANCE_ID" ]; then
    log "ERROR: Failed to get instance ID. Cannot continue monitoring."
    exit 1
fi

REGION=$(get_instance_metadata "placement/region")
if [ $? -ne 0 ] || [ -z "$REGION" ]; then
    log "ERROR: Failed to get region. Cannot continue monitoring."
    exit 1
fi

log "Instance ID: $INSTANCE_ID, Region: $REGION"

# Initialize last activity time to now
LAST_ACTIVITY=$(date +%s)
log "Initial activity time set to $(date -d @$LAST_ACTIVITY '+%Y-%m-%d %H:%M:%S')"

# Main monitoring loop
while true; do
    # Check if Docker is running
    if ! systemctl is-active --quiet docker; then
        log "Docker service is not running. Attempting to start it..."
        sudo systemctl start docker
        sleep 5
        
        if ! systemctl is-active --quiet docker; then
            log "Failed to start Docker. Will retry in next cycle."
            sleep $CHECK_INTERVAL_SECONDS
            continue
        fi
    fi
    
    # Check if Odoo container is running
    ODOO_CONTAINER=$(docker ps -q -f name=web)
    if [ -z "$ODOO_CONTAINER" ]; then
        log "Odoo container is not running. Checking if it should be started..."
        
        # Only try to start if docker-compose.yml exists
        if [ -f "$HOME/docker-compose.yml" ]; then
            log "Attempting to start Odoo containers..."
            cd $HOME
            docker-compose up -d
            sleep 10
            
            # Check if container started successfully
            ODOO_CONTAINER=$(docker ps -q -f name=web)
            if [ -z "$ODOO_CONTAINER" ]; then
                log "Failed to start Odoo container. Will retry in next cycle."
            else
                log "Successfully started Odoo container."
                # Reset last activity time since we just started
                LAST_ACTIVITY=$(date +%s)
            fi
        else
            log "docker-compose.yml not found. Cannot start Odoo."
        fi
        
        sleep $CHECK_INTERVAL_SECONDS
        continue
    fi

    # Check for activity indicators
    ACTIVITY_DETECTED=false
    
    # 1. Check for network connections to port 8069
    CONNECTION_COUNT=$(docker exec $ODOO_CONTAINER netstat -tn 2>/dev/null | grep ESTABLISHED | grep :8069 | wc -l)
    if [ $? -ne 0 ]; then
        # If command failed, try alternative approach
        CONNECTION_COUNT=$(docker exec $ODOO_CONTAINER ss -tn 2>/dev/null | grep ESTAB | grep :8069 | wc -l)
        if [ $? -ne 0 ]; then
            log "Warning: Failed to check network connections. Using fallback methods only."
            CONNECTION_COUNT=0
        fi
    fi
    
    # 2. Check for recent HTTP requests in logs
    RECENT_LOGS=$(docker logs --since=1m $ODOO_CONTAINER 2>/dev/null | grep -E "POST|GET /web" | wc -l)
    if [ $? -ne 0 ]; then
        log "Warning: Failed to check container logs."
        RECENT_LOGS=0
    fi
    
    # 3. Check for recent logins
    RECENT_LOGINS=$(docker logs --since=2m $ODOO_CONTAINER 2>/dev/null | grep "Login success" | wc -l)
    if [ $? -ne 0 ]; then
        log "Warning: Failed to check login logs."
        RECENT_LOGINS=0
    fi
    
    # Determine if there's activity
    if [ $CONNECTION_COUNT -gt 0 ] || [ $RECENT_LOGS -gt 3 ] || [ $RECENT_LOGINS -gt 0 ]; then
        ACTIVITY_DETECTED=true
        LAST_ACTIVITY=$(date +%s)
        log "Activity detected! Connections: $CONNECTION_COUNT, Log events: $RECENT_LOGS, Logins: $RECENT_LOGINS"
    else
        # Calculate minutes since last activity
        CURRENT_TIME=$(date +%s)
        ELAPSED_SECONDS=$((CURRENT_TIME - LAST_ACTIVITY))
        ELAPSED_MINUTES=$((ELAPSED_SECONDS / 60))
        REMAINING_MINUTES=$((INACTIVITY_THRESHOLD_MINUTES - ELAPSED_MINUTES))
        
        # Create a status file that can be read by the UI
        echo "{\"lastActivity\":\"$(date -d @$LAST_ACTIVITY '+%Y-%m-%d %H:%M:%S')\", \"remainingMinutes\":$REMAINING_MINUTES}" > $HOME/shutdown_status.json
        
        if [ $REMAINING_MINUTES -le $WARNING_MINUTES ] && [ $REMAINING_MINUTES -gt 0 ]; then
            log "Warning: $REMAINING_MINUTES minutes remaining until shutdown. No current activity."
        fi
        
        if [ $REMAINING_MINUTES -le 0 ]; then
            log "No activity for $ELAPSED_MINUTES minutes, exceeding threshold of $INACTIVITY_THRESHOLD_MINUTES minutes"
            log "Initiating self-shutdown sequence"
            
            # Update status file with shutdown in progress
            echo "{\"lastActivity\":\"$(date -d @$LAST_ACTIVITY '+%Y-%m-%d %H:%M:%S')\", \"remainingMinutes\":0, \"shuttingDown\":true}" > $HOME/shutdown_status.json
            
            # Execute the graceful shutdown script
            log "Stopping Docker containers..."
            
            # Check if script exists before running it
            if [ -f "$HOME/stop-odoo.sh" ]; then
                if [ -x "$HOME/stop-odoo.sh" ]; then
                    $HOME/stop-odoo.sh
                    if [ $? -ne 0 ]; then
                        log "Warning: stop-odoo.sh script returned non-zero exit code."
                        
                        # Fallback: force stop containers if script fails
                        log "Falling back to docker-compose down..."
                        cd $HOME
                        docker-compose down --timeout 30
                    fi
                else
                    log "stop-odoo.sh exists but is not executable. Attempting chmod +x..."
                    chmod +x $HOME/stop-odoo.sh
                    $HOME/stop-odoo.sh
                fi
            else
                log "stop-odoo.sh not found. Falling back to docker-compose down..."
                cd $HOME
                docker-compose down --timeout 30
            fi
            
            # Shut down the instance
            log "Shutting down the EC2 instance..."
            
            # First try with AWS CLI, if that fails use EC2 shutdown API
            aws ec2 stop-instances --instance-ids $INSTANCE_ID --region $REGION
            if [ $? -ne 0 ]; then
                log "AWS CLI failed to stop instance. Trying EC2 shutdown API..."
                shutdown -h now "Automatic shutdown due to inactivity"
            fi
            
            log "Shutdown command sent. Monitoring service ending."
            cleanup
            exit 0
        else
            log "No current activity. Minutes since last activity: $ELAPSED_MINUTES, Minutes until shutdown: $REMAINING_MINUTES"
        fi
    fi
    
    # Sleep before next check
    sleep $CHECK_INTERVAL_SECONDS
done
