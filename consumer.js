const { Kafka } = require('kafkajs');
const WebSocket = require('ws');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

const kafka = new Kafka({
    clientId: 'figurine-dashboard',
    brokers: ['10.100.13.239:9092'], // Replace with your Kafka broker IP and port
});

const registry = new SchemaRegistry({ 
    host: 'http://10.100.13.239:8081' // Replace with your schema registry host
});

const consumer = kafka.consumer({ groupId: 'figurine-web' });
const wss = new WebSocket.Server({ port: 8080 });

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
    await consumer.subscribe({ topic: 'cdc_mysql_Figurines.kafka_db.figurines', fromBeginning: true });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            console.log('Raw message:', message.value); // Log raw message for inspection

            try {
                // Use the Schema Registry to decode the message
                const decodedMessage = await registry.decode(message.value);
                console.log('Decoded message:', decodedMessage);
                
                // Access the 'after' object
                if (decodedMessage.after) {
                    const figurineBeforeData = decodedMessage.before;
                    const figurineData = decodedMessage.after;

                    const formattedData = {
                        figurine_id: figurineData.figurine_id,
                        name: figurineData.name,
                        description: figurineData.description || '',
                        before_price: figurineBeforeData.price,
                        price: figurineData.price,
                        before_quantity: figurineBeforeData.quantity,
                        quantity: figurineData.quantity,
                        status: figurineData.status
                    };

                    console.log('Broadcasting message:', formattedData);
                    broadcast(formattedData);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
                console.log('Offending message:', message.value);
            }
        },
    });
};

runConsumer().catch(console.error);

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

