import React, { useState } from "react";
import { FlatList } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, Button, Input, Spinner, Theme } from "tamagui";

// names depend on operationIds; with yours it should be useListPlans/useCreatePlan
import { useListPlans, useCreatePlan, getListPlansQueryKey } from "../src/api/generated/plans/plans";
import { useAuth } from "../src/context/AuthContext";

export default function PlansScreen() {
}
