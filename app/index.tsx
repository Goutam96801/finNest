import { View } from 'react-native'

/**
 * Boot placeholder. SplashGate in root layout performs the real redirect
 * after dismissing any restored modals (e.g. Update Profile).
 */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: '#000' }} />
}
