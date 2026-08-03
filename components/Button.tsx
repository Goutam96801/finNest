import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { CustomButtonProps } from '@/types'
import Loading from './Loading'

const Button = ({
    className,
    onPress,
    loading = false,
    children,
}: CustomButtonProps) => {
    if (loading) {
        return (
            <View
                className={`bg-transparent rounded-[17px] h-[52px] justify-center items-center`}
                style={{ borderCurve: "continuous" }}
            >
            <Loading fill={false} />
            </View>
        )
    }
    return (
        <TouchableOpacity
            onPress={onPress}
            className={`bg-[#a3e635] rounded-[17px] h-[52px] justify-center items-center ${className}`}
            style={{ borderCurve: "continuous" }}
        >
            {children}
        </TouchableOpacity>
    )
}

export default Button

const styles = StyleSheet.create({})