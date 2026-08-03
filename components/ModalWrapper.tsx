import {  Platform, View } from 'react-native'
import React from 'react'
import { ModalWrapperProps } from '@/types'

const ModalWrapper = ({ style, children, bg = "#171717" }: ModalWrapperProps) => {
    let paddingTop = Platform.OS === 'ios' ? 15 : 50;
    let paddingBottom = Platform.OS === 'ios' ? 20 : 10;
    return (
        <View style={[{
            paddingTop,
            paddingBottom,
            flex: 1,
            backgroundColor: bg
        },
        style && style]}>
            {children}
        </View>
    )
}

export default ModalWrapper