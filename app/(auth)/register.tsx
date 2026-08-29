import { Pressable, StyleSheet, Text, View } from 'react-native'
import { showAlert } from '@/context/alertContext'
import React, { useRef, useState } from 'react'
import ScreenWrapper from '@/components/ScreenWrapper'
import BackButton from '@/components/BackButton'
import Typo from '@/components/Typo'
import Input from '@/components/Input'
import * as Icons from 'phosphor-react-native'
import { verticalScale } from '@/utils/styling'
import Button from '@/components/Button'
import { useRouter } from 'expo-router'
import { signup } from '@/lib/services/auth'

const Register = () => {
    const router = useRouter();
    const emailRef = useRef("");
    const passwordRef = useRef("");
    const nameRef = useRef("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        if (!nameRef.current || !emailRef.current || !passwordRef.current) {
            showAlert("Sign Up", "Please fill all the fields");
            return;
        }

        if (!emailRef.current.includes("@")) {
            showAlert("Sign Up", "Enter a valid email address.");
            return;
        }

        if (passwordRef.current.length < 6) {
            showAlert("Sign Up", "Password must be at least 6 characters.");
            return;
        }

        try {
            setIsLoading(true);
            await signup(
                emailRef.current.trim(),
                passwordRef.current,
                nameRef.current.trim()
            );
        } catch (error: any) {
            showAlert("Sign Up Failed", error.message);
        } finally {
            setIsLoading(false);
        }

    }
    return (
        <ScreenWrapper>
            <View className='flex-1 gap-[30px] px-5'>
                <BackButton iconSize={28} />

                <View className='gap-[5px] mt-5'>
                    <Typo size={30} fontWeight={"800"}>Let&apos;s</Typo>
                    <Typo size={30} fontWeight={"800"}>Get Started</Typo>
                </View>
                <View className='gap-5'>
                    <Typo size={16} color='#d4d4d4' >
                        Create an account to track all your expenses
                    </Typo>
                    <Input
                        placeholder='Enter your name'
                        onChangeText={(value) => (nameRef.current = value)}
                        icon={
                            <Icons.User
                                size={verticalScale(26)}
                                color='#d4d4d4'
                            />
                        }
                    />
                    <Input
                        placeholder='Enter your email'
                        onChangeText={(value) => (emailRef.current = value)}
                        icon={
                            <Icons.At
                                size={verticalScale(26)}
                                color='#d4d4d4'
                            />
                        }
                    />
                    <Input
                        placeholder='Enter your password'
                        secureTextEntry
                        onChangeText={(value) => (passwordRef.current = value)}
                        icon={
                            <Icons.Lock
                                size={verticalScale(26)}
                                color='#d4d4d4'
                            />
                        }
                    />
                    <Button loading={isLoading} onPress={handleSubmit}>
                        <Typo fontWeight={"700"} color='#000'>Sign Up</Typo>
                    </Button>
                </View>
                <View
                    className='flex-row justify-center items-center gap-[5px]'
                >
                    <Typo size={15}>
                        Already have an account?
                    </Typo>
                    <Pressable onPress={() => router.replace("/(auth)/login")}>
                        <Typo size={15} fontWeight={'700'} color='#a3e635'>
                            Login
                        </Typo>
                    </Pressable>
                </View>
            </View>
        </ScreenWrapper>
    )
}

export default Register

const styles = StyleSheet.create({})