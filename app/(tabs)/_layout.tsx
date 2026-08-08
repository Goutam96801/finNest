import CustomTabs from '@/components/CustomTabs'
import { Tabs } from 'expo-router'
import React from 'react'
import { StyleSheet } from 'react-native'

const _layout = () => {
    return (
        <Tabs
            tabBar={(props) => <CustomTabs {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="statistics" />
            <Tabs.Screen name="fynn" />
            <Tabs.Screen name="accounts" />
            <Tabs.Screen name="profile" />
        </Tabs>
    )
}

export default _layout
const styles = StyleSheet.create({})
