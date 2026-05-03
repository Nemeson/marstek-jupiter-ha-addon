#!/usr/bin/env bashio
set -e

# Load config from Home Assistant
export MQTT_BROKER_URL=$(bashio::config 'mqtt_broker_url')
export MQTT_USERNAME=$(bashio::config 'mqtt_username')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')
export MQTT_TOPIC_PREFIX=$(bashio::config 'topic_prefix')
export DEVICE_TYPE=$(bashio::config 'device_type')
export DEVICE_ID=$(bashio::config 'device_id')
export MQTT_POLLING_INTERVAL=$(bashio::config 'polling_interval')
export MQTT_RESPONSE_TIMEOUT=$(bashio::config 'response_timeout')
export POLL_CELL_DATA=$(bashio::config 'enable_cell_data')
export LOG_LEVEL=$(bashio::config 'log_level')

bashio::log.info "Starting Marstek Jupiter C+ Add-on..."
bashio::log.info "Device: ${DEVICE_TYPE} / ${DEVICE_ID}"

# Start the application
exec node dist/index.js
