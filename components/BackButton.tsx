import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { BackButtonProps } from '@/types'
import { useRouter } from 'expo-router';
import { CaretLeftIcon } from 'phosphor-react-native';
import { verticalScale } from '@/utils/styling';

const BackButton = ({
    className,
    iconSize = 26,
}: BackButtonProps) => {
    const router = useRouter();
    return (
        <TouchableOpacity 
        onPress={() => router.back()} 
        className={`bg-[#525252] self-start rounded-xl p-1`}
        style={{borderCurve:"continuous"}}
        >
            <CaretLeftIcon
                size={verticalScale(iconSize)}
                color="#fff"
                weight='bold'
            />
        </TouchableOpacity>
    )
}

export default BackButton

const styles = StyleSheet.create({})