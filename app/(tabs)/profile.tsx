import Header from '@/components/Header'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { useAuth } from '@/context/authContext'
import { logout } from '@/lib/services/auth'
import { getProfileImage } from '@/lib/services/image-service'
import { accountOptionType } from '@/types'
import { verticalScale } from '@/utils/styling'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Icons from 'phosphor-react-native'
import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { showAlert } from '@/context/alertContext'
import Animated, { FadeInDown } from 'react-native-reanimated'
const Profile = () => {
    const { user } = useAuth();
    const router = useRouter();

    const accountOptions: accountOptionType[] = [
        {
            title: "Edit Profile",
            icon: (
                <Icons.User
                    size={26}
                    color='#fff'
                    weight='fill'
                />
            ),
            routeName: '/(modals)/profileModal',
            bgColor: "#6366f1"
        },
        {
            title: "Settings",
            icon: (
                <Icons.GearSix
                    size={26}
                    color='#fff'
                    weight='fill'
                />
            ),
            routeName: '/settings',
            bgColor: "#059669"
        },
        {
            title: "Privacy Policy",
            icon: (
                <Icons.Lock
                    size={26}
                    color='#fff'
                    weight='fill'
                />
            ),
            routeName: '/(modals)/privacyPolicy',
            bgColor: "#6366f1"
        },

        {
            title: "Logout",
            icon: (
                <Icons.Power
                    size={26}
                    color='#fff'
                    weight='fill'
                />
            ),
            // routeName:'/(modals)/profileModal',
            bgColor: "#e11d4d"
        },
    ]

    const showLogoutAlert = () => {
        showAlert("Confirm", "Are you sure you want to logout?", [
            {
                text: "Cancel",
                onPress: () => console.log("cancel logout"),
                style: 'cancel'
            },
            {
                text: "Logout",
                onPress: logout,
                style: 'destructive'
            }
        ])
    }

    const handlePress = (item: accountOptionType) => {
        if (item.title == 'Logout') {
            showLogoutAlert();
        }
        if (item.routeName) router.push(item.routeName);
    }
    return (
        <ScreenWrapper>
            <View className='flex-1 px-5'>
                {/* header */}
                <Header title='Profile' className='my-[10px]' />

                <View className='mt-[30px] items-center gap-[15px]'>
                    {/* avatar */}
                    <View>
                        <Image
                            source={getProfileImage(user?.user_metadata?.avatar_url || user?.user_metadata?.avatar)}
                            contentFit='cover'
                            style={{
                                width: 135,
                                height: 135,
                                backgroundColor: "#d4d4d4",
                                alignSelf: 'center',
                                borderRadius: 120
                            }}
                            transition={100}
                        />
                    </View>
                    {/* name and email */}
                    <View className='gap-1 items-center'>
                        <Typo size={24} fontWeight={'600'} color='#f5f5f5'>{user?.user_metadata.display_name}</Typo>
                        <Typo size={15} color='#a3a3a3'>{user?.email}</Typo>
                    </View>
                </View>

                {/* Account options */}
                <View
                    className='mt-9'
                >
                    {
                        accountOptions.map((item, index) => {
                            return (
                                <Animated.View
                                    entering={FadeInDown.delay(index * 50).springify().damping(40).stiffness(200)}
                                    className='mb-4'
                                    key={index}
                                >
                                    <TouchableOpacity
                                        className="flex-row items-center gap-[10px]"
                                        onPress={() => handlePress(item)}
                                    >
                                        <View
                                            className='h-11 w-11 items-center justify-center rounded-2xl'
                                            style={{ backgroundColor: item.bgColor }}
                                        >
                                            {item.icon}
                                        </View>
                                        <Typo size={16} className='flex-1' fontWeight={'500'}>{item.title}
                                        </Typo>
                                        <Icons.CaretRight
                                            size={verticalScale(20)}
                                            weight='bold'
                                            color="#fff"
                                        />
                                    </TouchableOpacity>
                                </Animated.View>
                            )
                        })
                    }
                </View>
            </View>
        </ScreenWrapper>
    )
}

export default Profile

const styles = StyleSheet.create({})