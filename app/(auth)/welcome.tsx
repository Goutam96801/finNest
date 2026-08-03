import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import Button from '@/components/Button'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useRouter } from 'expo-router'

const Welcome = () => {
  const router = useRouter();
  return (
    <ScreenWrapper>
      <View className='flex-1 justify-between pt-7'>
        {/* Login Button and imgae */}
        <View>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
            <Typo className=' self-end mr-5' fontWeight={"500"}>Sign In</Typo>
          </TouchableOpacity>
          <Animated.Image
            entering={FadeIn.duration(1000)}
            source={require('../../assets/images/welcome.png')}
            resizeMode='contain'
            className='w-full h-[300px] self-center mt-[100px]'
          />
        </View>

        {/* Footer */}
        <View
          className=' bg-[#171717] items-center pt-[30px] pb-[45px] gap-5'
          style={{
            shadowColor: "white",
            shadowOffset: { width: 0, height: -10 },
            elevation: 40,
            shadowRadius: 25,
            shadowOpacity: 0.15
          }}
        >
          <Animated.View
            className='items-center'
            entering={FadeInDown
              .springify()
              .damping(40)
              .stiffness(200)}
          >
            <Typo size={30} fontWeight={"800"}>Always take control</Typo>
            <Typo size={30} fontWeight={"800"}>of your finances</Typo>
          </Animated.View>
          <Animated.View
            className='items-center gap-2'
            entering={FadeInDown
              .delay(100)
              .springify()
              .damping(40)
              .stiffness(200)}
          >
            <Typo size={17} className='text-[#e5e5e5]'>Finance must be arranged to set a better</Typo>
            <Typo size={17} className='text-[#e5e5e5]'>lifestyle in future</Typo>
          </Animated.View>
          <Animated.View
            className='w-full px-[25px]'
            entering={FadeInDown
              .delay(200)
              .springify()
              .damping(40)
              .stiffness(200)}
          >
            <Button onPress={() => router.push("/(auth)/register")}>
              <Typo size={22} color='#171717' fontWeight={"600"}>Get Started</Typo>
            </Button>
          </Animated.View>
        </View>
      </View>
    </ScreenWrapper>
  )
}

export default Welcome