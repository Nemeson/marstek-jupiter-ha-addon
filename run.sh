#!/usr/bin/env bashio
set -e

# Load config from Home Assistant
export MQTT_BROKER_URL=$(bashio::config 'mqtt_broker_url')
export MQTT_USERNAME=$(bashio::config 'mqtt_username')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')
export MQTT_TOPIC_PREFIX=$(bashio::config 'topic_prefix')
export DEVICE_TYPE=$(bashio::config 'device_type')
export DEVICE_ID=$(bashio::config 'device_id')
export BROKER_ID=$(bashio::config 'broker_id')
export MQTT_POLLING_INTERVAL=$(bashio::config 'polling_interval')
export MQTT_RESPONSE_TIMEOUT=$(bashio::config 'response_timeout')
export POLL_CELL_DATA=$(bashio::config 'enable_cell_data')
export LOG_LEVEL=$(bashio::config 'log_level')
export USE_CLOUD_BRIDGE=$(bashio::config 'use_cloud_bridge')
export CLOUD_USERNAME=$(bashio::config 'cloud_username')
export CLOUD_PASSWORD=$(bashio::config 'cloud_password')
export HEALTH_PORT=$(bashio::config 'health_port')

bashio::log.info "Starting Marstek Jupiter C+ Add-on..."
bashio::log.info "Device: ${DEVICE_TYPE} / ${DEVICE_ID}"
bashio::log.info "Broker: ${BROKER_ID}"

# Auto-discover cloud broker URL from hame-relay certs when cloud bridge is enabled
if bashio::config.true 'use_cloud_bridge'; then
    CLOUD_BROKER_URL=$(bashio::config 'cloud_broker_url')
    
    # If cloud_broker_url is not set in config, read from embedded hame-relay certs
    if [ -z "$CLOUD_BROKER_URL" ]; then
        CERT_FILE="/app/certs/${BROKER_ID}-url"
        
        if [ -f "$CERT_FILE" ]; then
            CLOUD_BROKER_URL=$(cat "$CERT_FILE" | tr -d '\n')
            bashio::log.info "Auto-discovered cloud broker URL from hame-relay certs: ${CLOUD_BROKER_URL}"
        else
            bashio::log.error "Cloud bridge enabled but broker URL cert not found: ${CERT_FILE}"
            bashio::log.error "Please either:"
            bashio::log.error "  1. Set cloud_broker_url explicitly in the add-on config, or"
            bashio::log.error "  2. Ensure the hame-relay Docker image certs are available"
            exit 1
        fi
    else
        bashio::log.info "Using configured cloud broker URL: ${CLOUD_BROKER_URL}"
    fi
    
    export CLOUD_BROKER_URL
    bashio::log.info "Cloud bridge enabled for user: ${CLOUD_USERNAME}"
fi

# Start the application
exec node dist/index.js
