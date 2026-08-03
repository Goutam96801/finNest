import { useAuth } from '@/context/authContext'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Image, View } from 'react-native'

export default function Index() {
  const router = useRouter()
  const { session, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    router.replace(session ? '/(tabs)' : '/(auth)/welcome')
  }, [loading, session, router])

  return (
    <View className="flex-1 items-center justify-center bg-[#171717]">
      <Image
        resizeMode="contain"
        source={require('../assets/images/splashImage.png')}
        className="h-[20%] aspect-square"
      />
    </View>
  )
}
