    const { Kafka, CompressionTypes, CompressionCodecs } = require('kafkajs');
    const WebSocket = require('ws');
    const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');
    const SnappyCodec = require('kafkajs-snappy')

    // Register Snappy compression codec with KafkaJS
    CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

    // Configure Kafka and Schema Registry connections
    const kafka = new Kafka({
        clientId: 'figurine-analytics',
        brokers: ['10.100.13.239:9092'], // Replace with your Kafka broker IP and port
    });

    const registry = new SchemaRegistry({
        host: 'http://10.100.13.239:8081' // Replace with your schema registry host
    });

    const consumer = kafka.consumer({ groupId: 'figurine-web-analytics' });
    const wss = new WebSocket.Server({ port: 8091 });

    // Helper function to broadcast messages to all connected WebSocket clients
    const broadcast = (data) => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    };

    const runConsumer = async () => {
        await consumer.connect();
        // Subscribe to the correct Kafka topic
        await consumer.subscribe({ topic: 'FIGURINE_EVENT_COUNTS_STREAM', fromBeginning: true });
        console.log("Subscribed to topic: FIGURINE_EVENT_COUNTS_STREAM");

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                console.log('Raw message:', message.value); // Log raw message for inspection

                try {
                    // Decode the message using Schema Registry
                    const decodedMessage = await registry.decode(message.value);
                    console.log('Decoded message:', decodedMessage);

                    // Ensure the decoded message structure matches the Avro schema
                    const eventCount = decodedMessage.EVENT_COUNT;
                    const figurineIdRaw = message.key.toString();
                    figurineId = figurineIdRaw.split(/[^A-Za-z0-9-_]+/)[0];

                    // Only broadcast if eventCount is not null
                    if (eventCount !== null) {
                        const figurineData = {
                            figurine_id: figurineId, // Retrieve figurine ID from the key
                            event_count: eventCount,
                        };

                        console.log('Broadcasting message:', figurineData);
                        broadcast(figurineData);
                    }
                } catch (error) {
                    console.error('Error parsing message:', error);
                    console.log('Offending message:', message.value);
                }
            }
        });
    };

    runConsumer().catch(console.error);

    wss.on('connection', (ws) => {
        console.log('Client connected');
        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });

