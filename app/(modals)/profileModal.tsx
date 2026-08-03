import BackButton from '@/components/BackButton'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import Button from '@/components/Button'
import Header from '@/components/Header'
import Input from '@/components/Input'
import ModalWrapper from '@/components/ModalWrapper'
import SelectField from '@/components/SelectField'
import Typo from '@/components/Typo'
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from '@/constants'
import { useAuth } from '@/context/authContext'
import { getProfileImage } from '@/lib/services/image-service'
import { getCurrentUser, updateProfile } from '@/lib/services/profile'
import { Profile } from '@/lib/types'
import { verticalScale } from '@/utils/styling'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { Pencil } from 'phosphor-react-native'
import React, { useEffect, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { showAlert } from '@/context/alertContext'

const ProfileModal = () => {
    const { user } = useAuth()
    const router = useRouter()
    const timezoneSheetRef = useRef<BottomSheetSelectHandle>(null)
    const currencySheetRef = useRef<BottomSheetSelectHandle>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [userData, setUserData] = useState<Profile>({
        full_name: '',
        avatar_url: '',
        timezone: '',
        currency: '',
    })

    useEffect(() => {
        let isMounted = true
        const loadProfile = async () => {
            if (!user?.id) return

            const data = await getCurrentUser(user.id)

            if (!isMounted || !data) return

            setUserData({
                full_name: data.full_name ?? '',
                avatar_url: data.avatar_url ?? '',
                timezone: data.timezone ?? '',
                currency: data.currency ?? '',
            })
        }

        loadProfile()

        return () => {
            isMounted = false
        }
    }, [user?.id])

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        })

        if (!result.canceled) {
            setUserData({ ...userData, avatar_url: result.assets[0].uri })
        }
    }

    const handleSave = async () => {
        if (!user?.id) return

        if (!userData.full_name?.trim()) {
            showAlert('Profile', 'Please fill the name field.')
            return
        }

        try {
            setIsLoading(true)
            const res = await updateProfile(user.id, userData)

            if (!res.success) {
                showAlert('Update Failed', res.msg)
                return
            }

            showAlert('Success', res.msg)
            router.back()
        } catch (error: any) {
            showAlert('Update Failed', error.message || 'Could not update your profile.')
        } finally {
            setIsLoading(false)
        }
    }

    const currentAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.avatar
    const timezoneLabel = TIMEZONE_OPTIONS.find((item) => item.value === userData.timezone)?.label ?? ''
    const currencyLabel = CURRENCY_OPTIONS.find((item) => item.value === userData.currency)?.label ?? ''

    return (
        <ModalWrapper>
            <View className='flex-1 px-5'>
                <Header
                    title="Update Profile"
                    leftIcon={<BackButton />}
                    className='mb-[10px]'
                />

                <ScrollView
                    className='flex-1'
                    contentContainerStyle={{ paddingTop: 15, paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                >
                    <View className='w-full items-center'>
                        <View style={{ width: verticalScale(135), height: verticalScale(135), position: 'relative' }}>
                            <Image
                                style={{
                                    width: verticalScale(135),
                                    height: verticalScale(135),
                                    backgroundColor: '#d4d4d4',
                                    borderRadius: 200,
                                    borderWidth: 1,
                                    borderColor: '#737373',
                                }}
                                source={userData.avatar_url ? { uri: userData.avatar_url } : getProfileImage(currentAvatar)}
                                contentFit='cover'
                                transition={100}
                            />
                            <TouchableOpacity
                                onPress={handlePickImage}
                                style={{
                                    position: 'absolute',
                                    right: 6,
                                    bottom: 6,
                                    borderRadius: 999,
                                    backgroundColor: '#f5f5f5',
                                    padding: 7,
                                    elevation: 3,
                                    shadowColor: '#000',
                                    shadowOpacity: 0.2,
                                    shadowRadius: 4,
                                }}
                            >
                                <Pencil size={verticalScale(20)} color='#262626' />
                            </TouchableOpacity>
                        </View>

                        <View className='mt-6 w-full gap-[10px]'>
                            <Typo color="#e5e5e5">Name</Typo>
                            <Input
                                placeholder='Name'
                                value={userData.full_name}
                                onChangeText={(value) => setUserData({ ...userData, full_name: value })}
                            />

                            <Typo color="#e5e5e5" className='mt-2'>Timezone</Typo>
                            <SelectField
                                valueLabel={timezoneLabel}
                                placeholder='Select timezone'
                                onPress={() => timezoneSheetRef.current?.present()}
                            />

                            <Typo color="#e5e5e5" className='mt-2'>Currency</Typo>
                            <SelectField
                                valueLabel={currencyLabel}
                                placeholder='Select currency'
                                onPress={() => currencySheetRef.current?.present()}
                            />
                        </View>
                    </View>
                </ScrollView>
            </View>
            <View className='mt-6 items-center flex-row justify-center px-5 gap-3 pt-[15px] border-t-[#404040] mb-[5px]  border-t-[1px]'>
                <Button loading={isLoading} onPress={handleSave} className='flex-1'>
                    <Typo fontWeight={'700'} color='#000'>Update</Typo>
                </Button>
            </View>

            <BottomSheetSelect
                ref={timezoneSheetRef}
                title="Timezone"
                options={TIMEZONE_OPTIONS}
                value={userData.timezone}
                onChange={(value) => setUserData((prev) => ({ ...prev, timezone: value }))}
            />
            <BottomSheetSelect
                ref={currencySheetRef}
                title="Currency"
                options={CURRENCY_OPTIONS}
                value={userData.currency}
                onChange={(value) => setUserData((prev) => ({ ...prev, currency: value }))}
            />
        </ModalWrapper>
    )
}

export default ProfileModal
