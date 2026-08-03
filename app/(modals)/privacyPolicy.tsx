import BackButton from '@/components/BackButton'
import Header from '@/components/Header'
import ModalWrapper from '@/components/ModalWrapper'
import Typo from '@/components/Typo'
import React from 'react'
import { ScrollView, View } from 'react-native'

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Overview',
    body: 'FinNest (“we”, “our”, or “the app”) helps you track accounts, transactions, subscriptions, and related financial activity. This Privacy Policy explains what information we collect, how we use it, and the choices you have. By using FinNest, you agree to this policy.',
  },
  {
    title: 'Information we collect',
    body: 'Account details you provide when signing up (such as name, email, and profile photo). Financial data you enter in the app, including accounts, balances, transactions, categories, notes, subscriptions, and notifications preferences. Technical data needed to run the service, such as authentication tokens and basic device/app diagnostics.',
  },
  {
    title: 'How we use your information',
    body: 'We use your information to provide and improve FinNest features (balances, history, statistics, reminders, search, and notifications), keep your session secure, prevent abuse, and communicate important service updates. We do not sell your personal data.',
  },
  {
    title: 'Storage and processors',
    body: 'Your data is stored and processed using trusted cloud infrastructure (including Supabase for authentication and database services). Data may be processed in the regions supported by those providers. We apply access controls so only authorized systems and processes can reach your account data.',
  },
  {
    title: 'Sharing',
    body: 'We share information only when needed to operate the app (for example with infrastructure providers under appropriate agreements), when required by law, or to protect the rights, safety, and integrity of FinNest and its users. We do not share your financial entries with advertisers.',
  },
  {
    title: 'Data retention',
    body: 'We keep your information while your account is active and as needed to provide the service. You may request deletion of your account and associated app data; some records may be retained where required for security, legal, or fraud-prevention reasons.',
  },
  {
    title: 'Your choices',
    body: 'You can update profile details in the app, manage the financial records you create, and sign out at any time. If you need help accessing, correcting, or deleting personal data, contact us using the email associated with your FinNest account support channel.',
  },
  {
    title: 'Security',
    body: 'We use industry-standard practices such as encrypted transport (HTTPS) and authenticated access to protect your information. No method of transmission or storage is completely secure; please use a strong password and protect your device.',
  },
  {
    title: 'Children’s privacy',
    body: 'FinNest is not directed to children under 13 (or the minimum age required in your region). We do not knowingly collect personal information from children.',
  },
  {
    title: 'Changes to this policy',
    body: 'We may update this Privacy Policy from time to time. Continued use of FinNest after changes become effective means you accept the updated policy. The “Last updated” date below reflects the latest revision.',
  },
  {
    title: 'Contact',
    body: 'Questions about privacy can be sent through your usual FinNest support channel or the email linked to your account. We will respond as reasonably practicable.',
  },
]

const PrivacyPolicy = () => {
  return (
    <ModalWrapper>
      <View className="flex-1 px-5">
        <Header title="Privacy Policy" leftIcon={<BackButton />} className="mb-4" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Typo size={13} color="#737373" className="mb-5">
            Last updated: 3 August 2026
          </Typo>

          {SECTIONS.map((section) => (
            <View key={section.title} className="mb-5">
              <Typo size={16} fontWeight="600" color="#f5f5f5" className="mb-2">
                {section.title}
              </Typo>
              <Typo size={14} color="#a3a3a3" style={{ lineHeight: 22 }}>
                {section.body}
              </Typo>
            </View>
          ))}
        </ScrollView>
      </View>
    </ModalWrapper>
  )
}

export default PrivacyPolicy
