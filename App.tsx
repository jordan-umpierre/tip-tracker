import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getDb } from './db';

export default function App() {
  // Temporary: proves the database opens and schema.sql actually loads.
  // Gets replaced once there's a real screen to render.
  const [dbStatus, setDbStatus] = useState('opening database...');

  useEffect(() => {
    getDb()
      .then(() => setDbStatus('database ready'))
      .catch((err) => setDbStatus(`database failed: ${err.message}`));
  }, []);

  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <Text>{dbStatus}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
