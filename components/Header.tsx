import { HeaderProps } from '@/types'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import Typo from './Typo'

const Header = ({ title = "", leftIcon, rightIcon, className }: HeaderProps) => {
    return (
        <View className={`w-full flex-row items-center ${className ?? ''}`}>
            <View className='w-10 items-start justify-center'>
                {leftIcon}
            </View>

            <View className='flex-1 items-center'>
                {title ? (
                    <Typo size={22} fontWeight={'600'}>
                        {title}
                    </Typo>
                ) : null}
            </View>

            <View className='w-10 items-end justify-center'>
                {rightIcon}
            </View>
        </View>
    )
}

export default Header

const styles = StyleSheet.create({})