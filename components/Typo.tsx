import { StyleSheet, Text, TextStyle, View } from 'react-native'
import React from 'react'
import { TypoProps } from '@/types'
import { verticalScale } from '@/utils/styling'

const Typo = ({
    size,
    color = '#fff',
    fontWeight = '400',
    children,
    className,
    textProps = {}
}: TypoProps) => {
    const textStyle: TextStyle = {
        fontSize: size ? verticalScale(size) : verticalScale(18),
        color,
        fontWeight,
    }
    return (
        <Text style={[textStyle]} className={className} {...textProps}>{children}</Text>
    )
}

export default Typo
