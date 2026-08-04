import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import { Subscription } from '@/lib/services/subscriptions'
import { verticalScale } from '@/utils/styling'
import { useRouter } from 'expo-router'
import { Plus } from 'phosphor-react-native'
import React from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

type UpcomingSubscriptionsProps = {
  items: Subscription[]
  onViewAllPress?: () => void
  onAddPress?: () => void
  onPaid?: (id: string) => void
  onSnooze?: (id: string) => void
  onSkip?: (id: string) => void
}

const formatDue = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const UpcomingSubscriptions = ({
  items,
  onViewAllPress,
  onAddPress,
  onPaid,
  onSnooze,
  onSkip,
}: UpcomingSubscriptionsProps) => {
  const router = useRouter()

  const openEdit = (id: string) => {
    router.push({
      pathname: '/(modals)/subscriptionModal',
      params: { id },
    })
  }

  const openActions = (item: Subscription) => {
    showAlert(
      item.name,
      `Due ${formatDue(item.nextDueDate)} · ₹${Number(item.amount).toLocaleString('en-IN')}`,
      [
        {
          text: 'Mark Paid',
          style: 'primary',
          onPress: () => onPaid?.(item.id),
        },
        {
          text: 'Snooze 3 days',
          onPress: () => onSnooze?.(item.id),
        },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => onSkip?.(item.id),
        },
      ],
      {
        onTitleAction: () => openEdit(item.id),
      }
    )
  }

  return (
    <View className="mt-5">
      <View className="mb-3 flex-row items-center justify-between">
        <Typo size={18} fontWeight="600" color="#f5f5f5">
          Upcoming Subscriptions
        </Typo>
        <TouchableOpacity onPress={onViewAllPress} hitSlop={10}>
          <Typo size={13} color="#a3e635" fontWeight="600">
            View all
          </Typo>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <Animated.View entering={FadeInDown.springify().damping(40).stiffness(200)}>
          <TouchableOpacity
            onPress={onAddPress}
            activeOpacity={0.85}
            className="h-28 items-center justify-center rounded-2xl border border-dashed border-[#525252] bg-[#171717] px-4"
          >
            <Plus size={verticalScale(28)} color="#a3e635" weight="bold" />
            <Typo size={14} color="#a3a3a3" className="mt-2">
              Add a subscription
            </Typo>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 12, alignItems: 'stretch' }}
        >
          {items.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(index * 50).springify().damping(40).stiffness(200)}
            >
              <TouchableOpacity
                onPress={() => openActions(item)}
                activeOpacity={0.85}
                className="h-[96px] w-44 justify-center rounded-2xl border border-[#404040] bg-[#262626] px-4 py-3"
              >
                <Typo fontWeight="600" color="#f5f5f5" textProps={{ numberOfLines: 1 }}>
                  {item.name}
                </Typo>
                <Typo size={12} color="#a3a3a3" className="mt-1">
                  Due {formatDue(item.nextDueDate)}
                </Typo>
                <Typo size={16} fontWeight="700" color="#a3e635" className="mt-2">
                  ₹{Number(item.amount).toLocaleString('en-IN')}
                </Typo>
              </TouchableOpacity>
            </Animated.View>
          ))}

          <Animated.View
            entering={FadeInDown.delay(items.length * 50).springify().damping(40).stiffness(200)}
          >
            <TouchableOpacity
              onPress={onAddPress}
              activeOpacity={0.85}
              className="h-[96px] w-28 items-center justify-center rounded-2xl border border-dashed border-[#525252] bg-[#171717] px-3"
            >
              <Plus size={verticalScale(26)} color="#a3e635" weight="bold" />
              <Typo size={12} color="#a3a3a3" className="mt-1">
                Add
              </Typo>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  )
}

export default UpcomingSubscriptions
